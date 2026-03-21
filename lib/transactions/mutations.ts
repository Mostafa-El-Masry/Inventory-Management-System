import { z } from "zod";

import { AuthContext, assertLocationAccess } from "@/lib/auth/permissions";
import { ensureMainWarehouseForContext } from "@/lib/locations/main-warehouse";
import {
  loadSystemCurrencyCode,
  normalizeSystemCurrencyValue,
  type SystemCurrencyCode,
  type SystemSettingsReader,
} from "@/lib/settings/system-currency";
import {
  isMissingSnapshotColumnError,
  stripSnapshotFields,
  stripSnapshotFieldsFromRows,
} from "@/lib/supabase/snapshot-schema-compat";
import { serviceFail, serviceOk, type ServiceResult } from "@/lib/utils/service-result";
import { transactionCreateSchema } from "@/lib/validation";

type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;

type SupplierRow = {
  id: string;
  code: string | null;
  name: string | null;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  barcode: string | null;
};

type TransactionLookupRow = {
  id: string;
  type?: string;
  status: string;
  source_location_id: string | null;
  destination_location_id: string | null;
};

type TransactionDraftRpcRecord = {
  id: string;
  tx_number: string | null;
  type: string;
  status: string;
};

type ResolvedTransactionWriteContext = {
  currencyCode: SystemCurrencyCode;
  normalizedSupplierInvoiceNumber: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  supplierSnapshot: { code: string | null; name: string | null } | null;
  productById: Map<string, ProductRow>;
};

export type TransactionSummary = {
  id: string;
  tx_number: string | null;
  type: string;
  status: string;
};

async function readResponseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function resolveTransactionWriteContext(
  context: AuthContext,
  payload: TransactionCreateInput,
): Promise<ServiceResult<ResolvedTransactionWriteContext>> {
  const currencyCode = await loadSystemCurrencyCode(
    context.supabase as unknown as SystemSettingsReader,
  );
  const normalizedSupplierInvoiceNumber =
    payload.supplier_invoice_number?.trim() || null;
  let sourceLocationId = payload.source_location_id ?? null;
  let destinationLocationId = payload.destination_location_id ?? null;
  let supplierSnapshot: { code: string | null; name: string | null } | null = null;

  if (payload.type === "RECEIPT") {
    const mainWarehouse = await ensureMainWarehouseForContext(context);
    if (!mainWarehouse.ok) {
      return serviceFail(mainWarehouse.status, mainWarehouse.error);
    }

    sourceLocationId = null;
    destinationLocationId = mainWarehouse.data.id;
  }

  if (payload.supplier_id) {
    const { data: supplier, error: supplierError } = await context.supabase
      .from("suppliers")
      .select("id, code, name, is_active")
      .eq("id", payload.supplier_id)
      .maybeSingle<SupplierRow>();

    if (supplierError) {
      return serviceFail(400, supplierError.message);
    }

    if (!supplier) {
      return serviceFail(404, "Supplier not found.");
    }

    if (!supplier.is_active) {
      return serviceFail(
        409,
        "Supplier is archived and cannot be used for new transactions.",
      );
    }

    supplierSnapshot = {
      code: supplier.code ?? null,
      name: supplier.name ?? null,
    };
  }

  const sourceError = assertLocationAccess(context, sourceLocationId);
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(context, destinationLocationId);
  if (destinationError) {
    return serviceFail(
      destinationError.status,
      await readResponseError(
        destinationError,
        "No access to the selected destination location.",
      ),
    );
  }

  const productIds = Array.from(new Set(payload.lines.map((line) => line.product_id)));

  const { data: productRows, error: productError } = await context.supabase
    .from("products")
    .select("id, sku, name, barcode")
    .in("id", productIds);

  if (productError) {
    return serviceFail(400, productError.message);
  }

  const productById = new Map(
    ((productRows ?? []) as ProductRow[]).map((product) => [product.id, product]),
  );

  if (productById.size !== productIds.length) {
    return serviceFail(404, "One or more products were not found.");
  }

  return serviceOk({
    currencyCode,
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  });
}

function buildDraftTransactionRpcPayload(
  payload: TransactionCreateInput,
  writeContext: ResolvedTransactionWriteContext,
) {
  return {
    transaction: {
      tx_number: `TX-${Date.now()}`,
      type: payload.type,
      source_location_id: writeContext.sourceLocationId,
      destination_location_id: writeContext.destinationLocationId,
      reference_type: payload.reference_type ?? null,
      reference_id: payload.reference_id ?? null,
      supplier_id: payload.supplier_id ?? null,
      supplier_code_snapshot: writeContext.supplierSnapshot?.code ?? null,
      supplier_name_snapshot: writeContext.supplierSnapshot?.name ?? null,
      supplier_invoice_number: writeContext.normalizedSupplierInvoiceNumber,
      supplier_invoice_date: payload.supplier_invoice_date ?? null,
      notes: payload.notes ?? null,
    },
    lines: payload.lines.map((line) => {
      const product = writeContext.productById.get(line.product_id);

      return {
        product_id: line.product_id,
        qty: line.qty,
        unit_cost: normalizeSystemCurrencyValue(
          line.unit_cost,
          writeContext.currencyCode,
        ),
        lot_number: line.lot_number ?? null,
        expiry_date: line.expiry_date ?? null,
        reason_code: line.reason_code ?? null,
        product_sku_snapshot: product?.sku ?? null,
        product_name_snapshot: product?.name ?? null,
        product_barcode_snapshot: product?.barcode ?? null,
      };
    }),
  };
}

async function saveInventoryDraftWithSnapshotFallback(
  context: AuthContext,
  transactionId: string | null,
  rpcPayload: ReturnType<typeof buildDraftTransactionRpcPayload>,
) {
  let { data, error } = await context.supabase.rpc("rpc_save_inventory_draft", {
    p_transaction_id: transactionId,
    p_transaction: rpcPayload.transaction,
    p_lines: rpcPayload.lines,
  });

  if (isMissingSnapshotColumnError(error)) {
    ({ data, error } = await context.supabase.rpc("rpc_save_inventory_draft", {
      p_transaction_id: transactionId,
      p_transaction: stripSnapshotFields(rpcPayload.transaction),
      p_lines: stripSnapshotFieldsFromRows(rpcPayload.lines),
    }));
  }

  return {
    data,
    error,
  };
}

export async function createInventoryTransaction(
  context: AuthContext,
  payload: TransactionCreateInput,
) {
  const writeContext = await resolveTransactionWriteContext(context, payload);
  if (!writeContext.ok) {
    return writeContext;
  }

  const {
    currencyCode,
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  } = writeContext.data;
  const rpcPayload = buildDraftTransactionRpcPayload(payload, {
    currencyCode,
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  });

  const { data, error } = await saveInventoryDraftWithSnapshotFallback(
    context,
    null,
    rpcPayload,
  );

  if (error || !data) {
    return serviceFail(400, error?.message ?? "Failed to create transaction.");
  }

  return serviceOk(data as TransactionDraftRpcRecord, 201);
}

export async function updateInventoryTransaction(
  context: AuthContext,
  id: string,
  payload: TransactionCreateInput,
) {
  const { data: transaction, error: findError } = await context.supabase
    .from("inventory_transactions")
    .select("id, type, status, source_location_id, destination_location_id")
    .eq("id", id)
    .single<TransactionLookupRow>();

  if (findError || !transaction) {
    return serviceFail(findError ? 404 : 404, findError?.message ?? "Transaction not found.");
  }

  if (transaction.type !== payload.type) {
    return serviceFail(409, "Transaction type cannot be changed.");
  }

  if (transaction.status !== "DRAFT") {
    return serviceFail(409, "Only DRAFT transactions can be updated.");
  }

  const sourceError = assertLocationAccess(context, transaction.source_location_id);
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(
    context,
    transaction.destination_location_id,
  );
  if (destinationError) {
    return serviceFail(
      destinationError.status,
      await readResponseError(
        destinationError,
        "No access to the selected destination location.",
      ),
    );
  }

  const writeContext = await resolveTransactionWriteContext(context, payload);
  if (!writeContext.ok) {
    return writeContext;
  }

  const {
    currencyCode,
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  } = writeContext.data;
  const rpcPayload = buildDraftTransactionRpcPayload(payload, {
    currencyCode,
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  });

  const { data, error } = await saveInventoryDraftWithSnapshotFallback(
    context,
    id,
    rpcPayload,
  );

  if (error || !data) {
    return serviceFail(400, error?.message ?? "Failed to update transaction.");
  }

  return serviceOk(data as TransactionDraftRpcRecord, 200);
}

export async function deleteInventoryTransaction(context: AuthContext, id: string) {
  const { data: transaction, error: findError } = await context.supabase
    .from("inventory_transactions")
    .select("id, status, source_location_id, destination_location_id")
    .eq("id", id)
    .single<TransactionLookupRow>();

  if (findError || !transaction) {
    return serviceFail(findError ? 404 : 404, findError?.message ?? "Transaction not found.");
  }

  const sourceError = assertLocationAccess(context, transaction.source_location_id);
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(
    context,
    transaction.destination_location_id,
  );
  if (destinationError) {
    return serviceFail(
      destinationError.status,
      await readResponseError(
        destinationError,
        "No access to the selected destination location.",
      ),
    );
  }

  if (transaction.status !== "DRAFT") {
    return serviceFail(409, "Only DRAFT transactions can be deleted.");
  }

  const { error } = await context.supabase.rpc("rpc_delete_inventory_draft", {
    p_transaction_id: id,
  });

  if (error) {
    return serviceFail(400, error.message);
  }

  return serviceOk({ success: true });
}

export async function postInventoryTransaction(context: AuthContext, id: string) {
  const { data: transaction, error: findError } = await context.supabase
    .from("inventory_transactions")
    .select("id, status, source_location_id, destination_location_id")
    .eq("id", id)
    .single<TransactionLookupRow>();

  if (findError || !transaction) {
    return serviceFail(findError ? 404 : 404, findError?.message ?? "Transaction not found.");
  }

  const sourceError = assertLocationAccess(context, transaction.source_location_id);
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(
    context,
    transaction.destination_location_id,
  );
  if (destinationError) {
    return serviceFail(
      destinationError.status,
      await readResponseError(
        destinationError,
        "No access to the selected destination location.",
      ),
    );
  }

  if (transaction.status !== "DRAFT") {
    return serviceFail(409, "Only DRAFT transactions can be posted.");
  }

  const { data, error } = await context.supabase.rpc("rpc_finalize_inventory_transaction", {
    p_transaction_id: id,
  });

  if (error) {
    return serviceFail(400, error.message);
  }

  return serviceOk({ success: true, result: data });
}

export async function unpostInventoryTransaction(context: AuthContext, id: string) {
  const { data: transaction, error: findError } = await context.supabase
    .from("inventory_transactions")
    .select("id, status, source_location_id, destination_location_id")
    .eq("id", id)
    .single<TransactionLookupRow>();

  if (findError || !transaction) {
    return serviceFail(findError ? 404 : 404, findError?.message ?? "Transaction not found.");
  }

  const sourceError = assertLocationAccess(context, transaction.source_location_id);
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(
    context,
    transaction.destination_location_id,
  );
  if (destinationError) {
    return serviceFail(
      destinationError.status,
      await readResponseError(
        destinationError,
        "No access to the selected destination location.",
      ),
    );
  }

  if (transaction.status !== "POSTED") {
    return serviceFail(409, "Only POSTED transactions can be unposted.");
  }

  const { data, error } = await context.supabase.rpc("rpc_unpost_transaction", {
    p_transaction_id: id,
  });

  if (error) {
    return serviceFail(400, error.message);
  }

  return serviceOk({ success: true, result: data });
}

export async function getTransactionSummary(
  context: AuthContext,
  id: string,
): Promise<ServiceResult<TransactionSummary>> {
  const { data, error } = await context.supabase
    .from("inventory_transactions")
    .select("id, tx_number, type, status")
    .eq("id", id)
    .single<TransactionSummary>();

  if (error || !data) {
    return serviceFail(error ? 404 : 404, error?.message ?? "Transaction not found.");
  }

  return serviceOk(data);
}
