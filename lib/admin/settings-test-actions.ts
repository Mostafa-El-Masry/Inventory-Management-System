import { z } from "zod";

import type { AuthContext } from "@/lib/auth/permissions";
import {
  ensureMainWarehouseForContext,
  isMainWarehouseLocation,
} from "@/lib/locations/main-warehouse";
import type {
  SettingsConsumptionTestPreview,
  SettingsPreviewLookup,
  SettingsPreviewProduct,
  SettingsTestActionKind,
  SettingsTestActionResponse,
  SettingsTestDefaultsResponse,
  SettingsTestRecordSummary,
  SettingsTransferTestPreview,
} from "@/lib/types/api";
import {
  createInventoryTransaction,
  postInventoryTransaction,
  submitInventoryTransaction,
} from "@/lib/transactions/mutations";
import {
  approveTransfer,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
} from "@/lib/transfers/mutations";
import { serviceFail, serviceOk, type ServiceResult } from "@/lib/utils/service-result";
import { settingsTestActionSchema } from "@/lib/validation";

type SettingsTestActionInput = z.infer<typeof settingsTestActionSchema>;

type ActiveProduct = {
  id: string;
  sku: string | null;
  name: string | null;
};

type ActiveLocation = {
  id: string;
  code: string | null;
  name: string | null;
};

type ActiveSupplier = {
  id: string;
  code: string | null;
  name: string | null;
};

type StockRow = {
  product_id: string;
  location_id: string;
  qty_on_hand: number;
};

type AutoTestMasterData = {
  products: ActiveProduct[];
  locations: ActiveLocation[];
  main_warehouse: ActiveLocation;
  suppliers: ActiveSupplier[];
  stock_rows: StockRow[];
};

type InventoryLifecycleResult =
  | {
      ok: true;
      record: SettingsTestRecordSummary;
      steps_completed: string[];
    }
  | {
      ok: false;
      status: number;
      record: SettingsTestRecordSummary | null;
      steps_completed: string[];
      failed_step: string;
      error: string;
    };

type TransferLifecycleResult =
  | {
      ok: true;
      record: SettingsTestRecordSummary;
      steps_completed: string[];
    }
  | {
      ok: false;
      status: number;
      record: SettingsTestRecordSummary | null;
      steps_completed: string[];
      failed_step: string;
      error: string;
    };

type PurchaseDefaults = {
  supplier: ActiveSupplier;
  location: ActiveLocation;
  product: ActiveProduct;
  qty: number;
  unit_cost: number;
};

type TransferDefaults = {
  supplier: ActiveSupplier;
  source_location: ActiveLocation;
  destination_location: ActiveLocation;
  product: ActiveProduct;
  qty: number;
  bootstrap_required: boolean;
};

type ConsumptionDefaults = {
  supplier: ActiveSupplier;
  location: ActiveLocation;
  product: ActiveProduct;
  qty: number;
  bootstrap_required: boolean;
};

const TEST_NOTE_PREFIX = "[TEST][AUTO]";
const AUTO_PURCHASE_QTY_MIN = 1;
const AUTO_PURCHASE_QTY_MAX = 5;
const AUTO_PURCHASE_UNIT_COST_MIN_CENTS = 500;
const AUTO_PURCHASE_UNIT_COST_MAX_CENTS = 5000;
const AUTO_PURCHASE_FALLBACK_UNIT_COST = 12.5;
const AUTO_TRANSFER_QTY = 1;
const AUTO_CONSUMPTION_QTY = 1;

function sortByCodeThenId<T extends { code: string | null; id: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftCode = (left.code ?? "").trim().toUpperCase();
    const rightCode = (right.code ?? "").trim().toUpperCase();
    return leftCode.localeCompare(rightCode) || left.id.localeCompare(right.id);
  });
}

function mergeMainWarehouseIntoLocations(
  locations: ActiveLocation[],
  mainWarehouse: ActiveLocation,
) {
  return sortByCodeThenId([
    mainWarehouse,
    ...locations.filter(
      (location) =>
        location.id !== mainWarehouse.id && !isMainWarehouseLocation(location),
    ),
  ]);
}

function sortBySkuThenId<T extends { sku: string | null; id: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftSku = (left.sku ?? "").trim().toUpperCase();
    const rightSku = (right.sku ?? "").trim().toUpperCase();
    return leftSku.localeCompare(rightSku) || left.id.localeCompare(right.id);
  });
}

function normalizeCode(value: string | null | undefined, fallback: string) {
  const trimmed = (value ?? "").trim().toUpperCase();
  const sanitized = trimmed.replace(/[^A-Z0-9-]/g, "");
  return sanitized.length > 0 ? sanitized : fallback;
}

function toPreviewLookup(
  item: ActiveLocation | ActiveSupplier,
  fallbackPrefix: "LOC" | "SUP",
): SettingsPreviewLookup {
  return {
    id: item.id,
    code: normalizeCode(item.code, `${fallbackPrefix}-${item.id}`),
    name: item.name ?? item.id,
  };
}

function toPreviewProduct(product: ActiveProduct): SettingsPreviewProduct {
  return {
    id: product.id,
    sku: normalizeCode(product.sku, `SKU-${product.id}`),
    name: product.name ?? product.id,
  };
}

function buildTestNotes(suffix: string) {
  return `${TEST_NOTE_PREFIX} ${suffix}`;
}

function buildStepName(prefix: string | null, step: string) {
  return prefix ? `${prefix}:${step}` : step;
}

function buildInvoiceNumber(label: string) {
  return `AUTO-${label}-${Date.now()}`;
}

function buildLotNumber(label: string) {
  return `AUTO-${label}-${Date.now()}`;
}

function pickRandomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function randomIntBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomCurrencyFromCents(minCents: number, maxCents: number) {
  const cents = randomIntBetween(minCents, maxCents);
  return Number((cents / 100).toFixed(2));
}

function explainSettingsTestError(kind: SettingsTestActionKind, error: string) {
  if (
    kind === "transfer" &&
    error.includes("Transfer lines can only be modified while transfer is REQUESTED.")
  ) {
    return "Transfer dispatch is blocked by an outdated database trigger. Apply Supabase migration 023 and retry.";
  }

  if (
    kind === "consumption" &&
    (error.includes("inventory_transactions_check") ||
      error.includes("inventory_transactions_location_requirements_check"))
  ) {
    return "Consumption is blocked by an outdated inventory transaction check constraint. Apply Supabase migration 023 and retry.";
  }

  return error;
}

function transactionRecordFromMutation(data: {
  id: string;
  tx_number?: string | null;
  status?: string | null;
  type?: string | null;
}): SettingsTestRecordSummary {
  return {
    entity: "transaction",
    id: String(data.id),
    number: data.tx_number ?? null,
    status: data.status ?? null,
    transaction_type: data.type ?? null,
  };
}

function transferRecordFromMutation(data: {
  id: string;
  transfer_number?: string | null;
  status?: string | null;
}): SettingsTestRecordSummary {
  return {
    entity: "transfer",
    id: String(data.id),
    number: data.transfer_number ?? null,
    status: data.status ?? null,
    transaction_type: null,
  };
}

function partialSuccess(
  kind: SettingsTestActionKind,
  record: SettingsTestRecordSummary,
  stepsCompleted: string[],
  failedStep: string,
  error: string,
  bootstrapRecord?: SettingsTestRecordSummary | null,
): ServiceResult<SettingsTestActionResponse> {
  return serviceOk(
    {
      success: false,
      kind,
      record,
      steps_completed: stepsCompleted,
      failed_step: failedStep,
      error: explainSettingsTestError(kind, error),
      bootstrap_record: bootstrapRecord ?? null,
    },
    207,
  );
}

async function loadAutoTestMasterData(
  context: AuthContext,
): Promise<ServiceResult<AutoTestMasterData>> {
  const mainWarehouse = await ensureMainWarehouseForContext(context);
  if (!mainWarehouse.ok) {
    return mainWarehouse;
  }

  const [productsResult, locationsResult, suppliersResult, stockResult] = await Promise.all([
    context.supabase
      .from("products")
      .select("id, sku, name")
      .eq("is_active", true)
      .order("sku", { ascending: true })
      .order("id", { ascending: true }),
    context.supabase
      .from("locations")
      .select("id, code, name")
      .eq("is_active", true)
      .order("code", { ascending: true })
      .order("id", { ascending: true }),
    context.supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("is_active", true)
      .order("code", { ascending: true })
      .order("id", { ascending: true }),
    context.supabase
      .from("inventory_batches")
      .select("product_id, location_id, qty_on_hand")
      .gt("qty_on_hand", 0),
  ]);

  if (productsResult.error) {
    return serviceFail(400, productsResult.error.message);
  }

  if (locationsResult.error) {
    return serviceFail(400, locationsResult.error.message);
  }

  if (suppliersResult.error) {
    return serviceFail(400, suppliersResult.error.message);
  }

  if (stockResult.error) {
    return serviceFail(400, stockResult.error.message);
  }

  const mergedLocations = mergeMainWarehouseIntoLocations(
    (locationsResult.data ?? []) as ActiveLocation[],
    {
      id: mainWarehouse.data.id,
      code: mainWarehouse.data.code,
      name: mainWarehouse.data.name,
    },
  );

  return serviceOk({
    products: sortBySkuThenId((productsResult.data ?? []) as ActiveProduct[]),
    locations: mergedLocations,
    main_warehouse: {
      id: mainWarehouse.data.id,
      code: mainWarehouse.data.code,
      name: mainWarehouse.data.name,
    },
    suppliers: sortByCodeThenId((suppliersResult.data ?? []) as ActiveSupplier[]),
    stock_rows: (stockResult.data ?? []) as StockRow[],
  });
}

function findFirstStockedProductForLocation(
  products: ActiveProduct[],
  stockRows: StockRow[],
  locationId: string,
) {
  const stockedProductIds = new Set(
    stockRows
      .filter((stock) => stock.location_id === locationId && Number(stock.qty_on_hand ?? 0) > 0)
      .map((stock) => stock.product_id),
  );

  return products.find((product) => stockedProductIds.has(product.id)) ?? null;
}

function findFirstStockedLocationProduct(
  locations: ActiveLocation[],
  products: ActiveProduct[],
  stockRows: StockRow[],
) {
  for (const location of locations) {
    const product = findFirstStockedProductForLocation(products, stockRows, location.id);
    if (product) {
      return {
        location,
        product,
      };
    }
  }

  return null;
}

function resolvePurchaseDefaults(masterData: AutoTestMasterData): ServiceResult<PurchaseDefaults> {
  const supplier = pickRandomItem(masterData.suppliers);
  if (!supplier) {
    return serviceFail(409, "No active suppliers found for purchase test.");
  }

  const product = pickRandomItem(masterData.products);
  if (!product) {
    return serviceFail(409, "No active products found for purchase test.");
  }

  return serviceOk({
    supplier,
    location: masterData.main_warehouse,
    product,
    qty: randomIntBetween(AUTO_PURCHASE_QTY_MIN, AUTO_PURCHASE_QTY_MAX),
    unit_cost: randomCurrencyFromCents(
      AUTO_PURCHASE_UNIT_COST_MIN_CENTS,
      AUTO_PURCHASE_UNIT_COST_MAX_CENTS,
    ),
  });
}

function resolveTransferDefaults(masterData: AutoTestMasterData): ServiceResult<TransferDefaults> {
  const sourceLocation = masterData.main_warehouse;
  const destinationLocation =
    masterData.locations.find(
      (location) =>
        location.id !== sourceLocation.id && !isMainWarehouseLocation(location),
    ) ?? null;

  if (!destinationLocation) {
    return serviceFail(409, "At least two active locations are required for transfer test.");
  }

  const stockedProduct = findFirstStockedProductForLocation(
    masterData.products,
    masterData.stock_rows,
    sourceLocation.id,
  );
  const product = stockedProduct ?? masterData.products[0];

  if (!product) {
    return serviceFail(409, "No active products found for transfer test.");
  }

  const supplier = masterData.suppliers[0];
  if (!stockedProduct && !supplier) {
    return serviceFail(409, "No active suppliers found for transfer test bootstrap.");
  }

  return serviceOk({
    supplier: supplier ?? { id: "", code: null, name: null },
    source_location: sourceLocation,
    destination_location: destinationLocation,
    product,
    qty: AUTO_TRANSFER_QTY,
    bootstrap_required: stockedProduct === null,
  });
}

function resolveConsumptionDefaults(
  masterData: AutoTestMasterData,
): ServiceResult<ConsumptionDefaults> {
  const stockedPair = findFirstStockedLocationProduct(
    masterData.locations,
    masterData.products,
    masterData.stock_rows,
  );

  const supplier = masterData.suppliers[0];

  if (stockedPair) {
    return serviceOk({
      supplier: supplier ?? { id: "", code: null, name: null },
      location: stockedPair.location,
      product: stockedPair.product,
      qty: AUTO_CONSUMPTION_QTY,
      bootstrap_required: false,
    });
  }

  const location = masterData.main_warehouse;
  if (!location) {
    return serviceFail(409, "No active locations found for consumption test.");
  }

  const product = masterData.products[0];
  if (!product) {
    return serviceFail(409, "No active products found for consumption test.");
  }

  if (!supplier) {
    return serviceFail(409, "No active suppliers found for consumption test bootstrap.");
  }

  return serviceOk({
    supplier,
    location,
    product,
    qty: AUTO_CONSUMPTION_QTY,
    bootstrap_required: true,
  });
}

function buildTransferPreview(masterData: AutoTestMasterData): SettingsTransferTestPreview {
  const defaults = resolveTransferDefaults(masterData);
  if (!defaults.ok) {
    return {
      source_location: masterData.locations[0]
        ? toPreviewLookup(masterData.locations[0], "LOC")
        : null,
      destination_location: masterData.locations[1]
        ? toPreviewLookup(masterData.locations[1], "LOC")
        : null,
      product: null,
      qty: AUTO_TRANSFER_QTY,
      bootstrap_required: true,
    };
  }

  return {
    source_location: toPreviewLookup(defaults.data.source_location, "LOC"),
    destination_location: toPreviewLookup(defaults.data.destination_location, "LOC"),
    product: toPreviewProduct(defaults.data.product),
    qty: defaults.data.qty,
    bootstrap_required: defaults.data.bootstrap_required,
  };
}

function buildConsumptionPreview(masterData: AutoTestMasterData): SettingsConsumptionTestPreview {
  const defaults = resolveConsumptionDefaults(masterData);
  if (!defaults.ok) {
    return {
      location: masterData.locations[0] ? toPreviewLookup(masterData.locations[0], "LOC") : null,
      product: null,
      qty: AUTO_CONSUMPTION_QTY,
      bootstrap_required: true,
    };
  }

  return {
    location: toPreviewLookup(defaults.data.location, "LOC"),
    product: toPreviewProduct(defaults.data.product),
    qty: defaults.data.qty,
    bootstrap_required: defaults.data.bootstrap_required,
  };
}

export async function getSettingsTestDefaults(
  context: AuthContext,
): Promise<ServiceResult<SettingsTestDefaultsResponse>> {
  const masterData = await loadAutoTestMasterData(context);
  if (!masterData.ok) {
    return masterData;
  }

  return serviceOk({
    transfer: buildTransferPreview(masterData.data),
    consumption: buildConsumptionPreview(masterData.data),
  });
}

async function runInventoryTransactionLifecycle(
  context: AuthContext,
  {
    type,
    supplier_id,
    supplier_invoice_number,
    supplier_invoice_date,
    source_location_id,
    destination_location_id,
    notes,
    lines,
    stepPrefix,
  }: {
    type: "RECEIPT" | "CONSUMPTION";
    supplier_id?: string | null;
    supplier_invoice_number?: string | null;
    supplier_invoice_date?: string | null;
    source_location_id?: string | null;
    destination_location_id?: string | null;
    notes: string;
    lines: Array<{
      product_id: string;
      qty: number;
      unit_cost?: number | null;
      lot_number?: string | null;
      expiry_date?: string | null;
      reason_code?: string | null;
    }>;
    stepPrefix: string | null;
  },
): Promise<InventoryLifecycleResult> {
  const createStep = buildStepName(stepPrefix, "create");
  const submitStep = buildStepName(stepPrefix, "submit");
  const postStep = buildStepName(stepPrefix, "post");
  const stepsCompleted: string[] = [];

  const created = await createInventoryTransaction(context, {
    type,
    supplier_id: supplier_id ?? null,
    supplier_invoice_number: supplier_invoice_number ?? null,
    supplier_invoice_date: supplier_invoice_date ?? null,
    source_location_id: source_location_id ?? null,
    destination_location_id: destination_location_id ?? null,
    notes,
    lines,
  });

  if (!created.ok) {
    return {
      ok: false,
      status: created.status,
      record: null,
      steps_completed: stepsCompleted,
      failed_step: createStep,
      error: created.error,
    };
  }

  const createdRecord = transactionRecordFromMutation({
    id: String(created.data.id),
    tx_number:
      created.data.tx_number === null || created.data.tx_number === undefined
        ? null
        : String(created.data.tx_number),
    status: String(created.data.status ?? "DRAFT"),
    type: String(created.data.type ?? type),
  });
  stepsCompleted.push(createStep);

  const submitted = await submitInventoryTransaction(context, createdRecord.id);
  if (!submitted.ok) {
    return {
      ok: false,
      status: 207,
      record: createdRecord,
      steps_completed: stepsCompleted,
      failed_step: submitStep,
      error: submitted.error,
    };
  }

  const submittedRecord: SettingsTestRecordSummary = {
    ...createdRecord,
    status: String((submitted.data as { status?: string }).status ?? "SUBMITTED"),
  };
  stepsCompleted.push(submitStep);

  const posted = await postInventoryTransaction(context, createdRecord.id);
  if (!posted.ok) {
    return {
      ok: false,
      status: 207,
      record: submittedRecord,
      steps_completed: stepsCompleted,
      failed_step: postStep,
      error: posted.error,
    };
  }

  stepsCompleted.push(postStep);

  return {
    ok: true,
    record: {
      ...submittedRecord,
      status: "POSTED",
    },
    steps_completed: stepsCompleted,
  };
}

async function runTransferLifecycle(
  context: AuthContext,
  {
    source_location_id,
    destination_location_id,
    product_id,
    qty,
    notes,
    stepPrefix,
  }: {
    source_location_id: string;
    destination_location_id: string;
    product_id: string;
    qty: number;
    notes: string;
    stepPrefix: string;
  },
): Promise<TransferLifecycleResult> {
  const createStep = buildStepName(stepPrefix, "create");
  const approveStep = buildStepName(stepPrefix, "approve");
  const dispatchStep = buildStepName(stepPrefix, "dispatch");
  const receiveStep = buildStepName(stepPrefix, "receive");
  const stepsCompleted: string[] = [];

  const created = await createTransfer(context, {
    from_location_id: source_location_id,
    to_location_id: destination_location_id,
    notes,
    lines: [
      {
        product_id,
        requested_qty: qty,
      },
    ],
  });

  if (!created.ok) {
    return {
      ok: false,
      status: created.status,
      record: null,
      steps_completed: stepsCompleted,
      failed_step: createStep,
      error: created.error,
    };
  }

  const createdRecord = transferRecordFromMutation({
    id: String(created.data.id),
    transfer_number:
      created.data.transfer_number === null || created.data.transfer_number === undefined
        ? null
        : String(created.data.transfer_number),
    status: String(created.data.status ?? "REQUESTED"),
  });
  stepsCompleted.push(createStep);

  const approved = await approveTransfer(context, createdRecord.id);
  if (!approved.ok) {
    return {
      ok: false,
      status: 207,
      record: createdRecord,
      steps_completed: stepsCompleted,
      failed_step: approveStep,
      error: approved.error,
    };
  }

  const approvedRecord: SettingsTestRecordSummary = {
    ...createdRecord,
    status: String((approved.data as { status?: string }).status ?? "APPROVED"),
  };
  stepsCompleted.push(approveStep);

  const dispatched = await dispatchTransfer(context, createdRecord.id);
  if (!dispatched.ok) {
    return {
      ok: false,
      status: 207,
      record: approvedRecord,
      steps_completed: stepsCompleted,
      failed_step: dispatchStep,
      error: dispatched.error,
    };
  }
  stepsCompleted.push(dispatchStep);

  const dispatchedRecord: SettingsTestRecordSummary = {
    ...approvedRecord,
    status: "DISPATCHED",
  };

  const received = await receiveTransfer(context, createdRecord.id);
  if (!received.ok) {
    return {
      ok: false,
      status: 207,
      record: dispatchedRecord,
      steps_completed: stepsCompleted,
      failed_step: receiveStep,
      error: received.error,
    };
  }

  stepsCompleted.push(receiveStep);

  return {
    ok: true,
    record: {
      ...dispatchedRecord,
      status: "RECEIVED",
    },
    steps_completed: stepsCompleted,
  };
}

async function runPurchaseTest(
  context: AuthContext,
): Promise<ServiceResult<SettingsTestActionResponse>> {
  const masterData = await loadAutoTestMasterData(context);
  if (!masterData.ok) {
    return masterData;
  }

  const defaults = resolvePurchaseDefaults(masterData.data);
  if (!defaults.ok) {
    return defaults;
  }

  const receipt = await runInventoryTransactionLifecycle(context, {
    type: "RECEIPT",
    supplier_id: defaults.data.supplier.id,
    supplier_invoice_number: buildInvoiceNumber("PURCHASE"),
    supplier_invoice_date: new Date().toISOString().slice(0, 10),
    source_location_id: null,
    destination_location_id: defaults.data.location.id,
    notes: buildTestNotes("purchase smoke test"),
    lines: [
      {
        product_id: defaults.data.product.id,
        qty: defaults.data.qty,
        unit_cost: defaults.data.unit_cost,
        lot_number: buildLotNumber("PURCHASE"),
        expiry_date: null,
        reason_code: "AUTO_TEST_PURCHASE",
      },
    ],
    stepPrefix: "purchase",
  });

  if (!receipt.ok) {
    if (!receipt.record) {
      return serviceFail(receipt.status, explainSettingsTestError("purchase", receipt.error));
    }

    return partialSuccess(
      "purchase",
      receipt.record,
      receipt.steps_completed,
      receipt.failed_step,
      receipt.error,
    );
  }

  return serviceOk(
    {
      success: true,
      kind: "purchase",
      record: receipt.record,
      steps_completed: receipt.steps_completed,
      bootstrap_record: null,
    },
    201,
  );
}

async function runTransferTest(
  context: AuthContext,
): Promise<ServiceResult<SettingsTestActionResponse>> {
  const masterData = await loadAutoTestMasterData(context);
  if (!masterData.ok) {
    return masterData;
  }

  const defaults = resolveTransferDefaults(masterData.data);
  if (!defaults.ok) {
    return defaults;
  }

  let bootstrapRecord: SettingsTestRecordSummary | null = null;
  const bootstrapSteps: string[] = [];

  if (defaults.data.bootstrap_required) {
    const bootstrapReceipt = await runInventoryTransactionLifecycle(context, {
      type: "RECEIPT",
      supplier_id: defaults.data.supplier.id,
      supplier_invoice_number: buildInvoiceNumber("TRANSFER-BOOTSTRAP"),
      supplier_invoice_date: new Date().toISOString().slice(0, 10),
      source_location_id: null,
      destination_location_id: defaults.data.source_location.id,
      notes: buildTestNotes("bootstrap purchase for transfer smoke test"),
      lines: [
        {
          product_id: defaults.data.product.id,
          qty: defaults.data.qty,
          unit_cost: AUTO_PURCHASE_FALLBACK_UNIT_COST,
          lot_number: buildLotNumber("TRANSFER-BOOTSTRAP"),
          expiry_date: null,
          reason_code: "AUTO_TEST_TRANSFER_BOOTSTRAP",
        },
      ],
      stepPrefix: "bootstrap",
    });

    if (!bootstrapReceipt.ok) {
      if (!bootstrapReceipt.record) {
        return serviceFail(
          bootstrapReceipt.status,
          explainSettingsTestError("transfer", bootstrapReceipt.error),
        );
      }

      return partialSuccess(
        "transfer",
        bootstrapReceipt.record,
        bootstrapReceipt.steps_completed,
        bootstrapReceipt.failed_step,
        bootstrapReceipt.error,
        bootstrapReceipt.record,
      );
    }

    bootstrapRecord = bootstrapReceipt.record;
    bootstrapSteps.push(...bootstrapReceipt.steps_completed);
  }

  const transfer = await runTransferLifecycle(context, {
    source_location_id: defaults.data.source_location.id,
    destination_location_id: defaults.data.destination_location.id,
    product_id: defaults.data.product.id,
    qty: defaults.data.qty,
    notes: buildTestNotes("transfer smoke test"),
    stepPrefix: "transfer",
  });

  if (!transfer.ok) {
    if (!transfer.record) {
      if (bootstrapRecord) {
        return partialSuccess(
          "transfer",
          bootstrapRecord,
          bootstrapSteps,
          transfer.failed_step,
          transfer.error,
          bootstrapRecord,
        );
      }

      return serviceFail(transfer.status, explainSettingsTestError("transfer", transfer.error));
    }

    return partialSuccess(
      "transfer",
      transfer.record,
      [...bootstrapSteps, ...transfer.steps_completed],
      transfer.failed_step,
      transfer.error,
      bootstrapRecord,
    );
  }

  return serviceOk(
    {
      success: true,
      kind: "transfer",
      record: transfer.record,
      steps_completed: [...bootstrapSteps, ...transfer.steps_completed],
      bootstrap_record: bootstrapRecord,
    },
    201,
  );
}

async function runConsumptionTest(
  context: AuthContext,
): Promise<ServiceResult<SettingsTestActionResponse>> {
  const masterData = await loadAutoTestMasterData(context);
  if (!masterData.ok) {
    return masterData;
  }

  const defaults = resolveConsumptionDefaults(masterData.data);
  if (!defaults.ok) {
    return defaults;
  }

  let bootstrapRecord: SettingsTestRecordSummary | null = null;
  const bootstrapSteps: string[] = [];

  if (defaults.data.bootstrap_required) {
    const bootstrapReceipt = await runInventoryTransactionLifecycle(context, {
      type: "RECEIPT",
      supplier_id: defaults.data.supplier.id,
      supplier_invoice_number: buildInvoiceNumber("CONSUMPTION-BOOTSTRAP"),
      supplier_invoice_date: new Date().toISOString().slice(0, 10),
      source_location_id: null,
      destination_location_id: defaults.data.location.id,
      notes: buildTestNotes("bootstrap purchase for consumption smoke test"),
      lines: [
        {
          product_id: defaults.data.product.id,
          qty: defaults.data.qty,
          unit_cost: AUTO_PURCHASE_FALLBACK_UNIT_COST,
          lot_number: buildLotNumber("CONSUMPTION-BOOTSTRAP"),
          expiry_date: null,
          reason_code: "AUTO_TEST_CONSUMPTION_BOOTSTRAP",
        },
      ],
      stepPrefix: "bootstrap",
    });

    if (!bootstrapReceipt.ok) {
      if (!bootstrapReceipt.record) {
        return serviceFail(
          bootstrapReceipt.status,
          explainSettingsTestError("consumption", bootstrapReceipt.error),
        );
      }

      return partialSuccess(
        "consumption",
        bootstrapReceipt.record,
        bootstrapReceipt.steps_completed,
        bootstrapReceipt.failed_step,
        bootstrapReceipt.error,
        bootstrapReceipt.record,
      );
    }

    bootstrapRecord = bootstrapReceipt.record;
    bootstrapSteps.push(...bootstrapReceipt.steps_completed);
  }

  const consumption = await runInventoryTransactionLifecycle(context, {
    type: "CONSUMPTION",
    supplier_id: null,
    supplier_invoice_number: null,
    supplier_invoice_date: null,
    source_location_id: defaults.data.location.id,
    destination_location_id: null,
    notes: buildTestNotes("consumption smoke test"),
    lines: [
      {
        product_id: defaults.data.product.id,
        qty: defaults.data.qty,
        unit_cost: null,
        lot_number: null,
        expiry_date: null,
        reason_code: "AUTO_TEST_CONSUMPTION_COGS",
      },
    ],
    stepPrefix: "consumption",
  });

  if (!consumption.ok) {
    if (!consumption.record) {
      if (bootstrapRecord) {
        return partialSuccess(
          "consumption",
          bootstrapRecord,
          bootstrapSteps,
          consumption.failed_step,
          consumption.error,
          bootstrapRecord,
        );
      }

      return serviceFail(
        consumption.status,
        explainSettingsTestError("consumption", consumption.error),
      );
    }

    return partialSuccess(
      "consumption",
      consumption.record,
      [...bootstrapSteps, ...consumption.steps_completed],
      consumption.failed_step,
      consumption.error,
      bootstrapRecord,
    );
  }

  return serviceOk(
    {
      success: true,
      kind: "consumption",
      record: consumption.record,
      steps_completed: [...bootstrapSteps, ...consumption.steps_completed],
      bootstrap_record: bootstrapRecord,
    },
    201,
  );
}

export async function runSettingsTestAction(
  context: AuthContext,
  payload: SettingsTestActionInput,
): Promise<ServiceResult<SettingsTestActionResponse>> {
  switch (payload.kind) {
    case "purchase":
      return runPurchaseTest(context);
    case "transfer":
      return runTransferTest(context);
    case "consumption":
      return runConsumptionTest(context);
    default:
      return serviceFail(422, "Unsupported test action.");
  }
}
