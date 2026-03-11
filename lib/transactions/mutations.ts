import { z } from "zod";

import { AuthContext, assertLocationAccess } from "@/lib/auth/permissions";
import { ensureMainWarehouseForContext } from "@/lib/locations/main-warehouse";
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

type TransactionPostRecord = {
  id: string;
  tx_number: string | null;
  type: string;
  status: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  supplier_id: string | null;
  supplier_code_snapshot?: string | null;
  supplier_name_snapshot?: string | null;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  created_at: string | null;
};

export type TransactionSummary = {
  id: string;
  tx_number: string | null;
  type: string;
  status: string;
};

const TRANSACTION_POST_SELECT_WITH_SNAPSHOTS =
  "id, tx_number, type, status, source_location_id, destination_location_id, supplier_id, supplier_code_snapshot, supplier_name_snapshot, supplier_invoice_number, supplier_invoice_date, created_at";
const TRANSACTION_POST_SELECT_LEGACY =
  "id, tx_number, type, status, source_location_id, destination_location_id, supplier_id, supplier_invoice_number, supplier_invoice_date, created_at";

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
) {
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
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  });
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
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  } = writeContext.data;

  const txRecord = {
    tx_number: `TX-${Date.now()}`,
    type: payload.type,
    status: "DRAFT",
    source_location_id: sourceLocationId,
    destination_location_id: destinationLocationId,
    reference_type: payload.reference_type ?? null,
    reference_id: payload.reference_id ?? null,
    supplier_id: payload.supplier_id ?? null,
    supplier_code_snapshot: supplierSnapshot?.code ?? null,
    supplier_name_snapshot: supplierSnapshot?.name ?? null,
    supplier_invoice_number: normalizedSupplierInvoiceNumber,
    supplier_invoice_date: payload.supplier_invoice_date ?? null,
    notes: payload.notes ?? null,
    created_by: context.user.id,
  };

  let { data: transaction, error: transactionError } = await context.supabase
    .from("inventory_transactions")
    .insert(txRecord)
    .select("*")
    .single();

  if (isMissingSnapshotColumnError(transactionError)) {
    ({ data: transaction, error: transactionError } = await context.supabase
      .from("inventory_transactions")
      .insert(stripSnapshotFields(txRecord))
      .select("*")
      .single());
  }

  if (transactionError || !transaction) {
    return serviceFail(
      400,
      transactionError?.message ?? "Failed to create transaction.",
    );
  }

  const lines = payload.lines.map((line) => {
    const product = productById.get(line.product_id);

    return {
      transaction_id: transaction.id,
      ...line,
      product_sku_snapshot: product?.sku ?? null,
      product_name_snapshot: product?.name ?? null,
      product_barcode_snapshot: product?.barcode ?? null,
    };
  });

  let { data: lineData, error: linesError } = await context.supabase
    .from("inventory_transaction_lines")
    .insert(lines)
    .select("*");

  if (isMissingSnapshotColumnError(linesError)) {
    ({ data: lineData, error: linesError } = await context.supabase
      .from("inventory_transaction_lines")
      .insert(stripSnapshotFieldsFromRows(lines))
      .select("*"));
  }

  if (linesError) {
    return serviceFail(400, linesError.message);
  }

  return serviceOk(
    {
      ...transaction,
      lines: lineData ?? [],
    },
    201,
  );
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
    normalizedSupplierInvoiceNumber,
    sourceLocationId,
    destinationLocationId,
    supplierSnapshot,
    productById,
  } = writeContext.data;

  const txRecord = {
    source_location_id: sourceLocationId,
    destination_location_id: destinationLocationId,
    reference_type: payload.reference_type ?? null,
    reference_id: payload.reference_id ?? null,
    supplier_id: payload.supplier_id ?? null,
    supplier_code_snapshot: supplierSnapshot?.code ?? null,
    supplier_name_snapshot: supplierSnapshot?.name ?? null,
    supplier_invoice_number: normalizedSupplierInvoiceNumber,
    supplier_invoice_date: payload.supplier_invoice_date ?? null,
    notes: payload.notes ?? null,
  };

  let updateError: { message: string } | null = null;
  const { error: withSnapshotsError } = await context.supabase
    .from("inventory_transactions")
    .update(txRecord)
    .eq("id", id);

  updateError = withSnapshotsError;

  if (isMissingSnapshotColumnError(updateError)) {
    const { error: legacyError } = await context.supabase
      .from("inventory_transactions")
      .update(stripSnapshotFields(txRecord))
      .eq("id", id);

    updateError = legacyError;
  }

  if (updateError) {
    return serviceFail(400, updateError.message);
  }

  const { error: deleteLinesError } = await context.supabase
    .from("inventory_transaction_lines")
    .delete()
    .eq("transaction_id", id);

  if (deleteLinesError) {
    return serviceFail(400, deleteLinesError.message);
  }

  const lines = payload.lines.map((line) => {
    const product = productById.get(line.product_id);

    return {
      transaction_id: id,
      ...line,
      product_sku_snapshot: product?.sku ?? null,
      product_name_snapshot: product?.name ?? null,
      product_barcode_snapshot: product?.barcode ?? null,
    };
  });

  let { data: lineData, error: linesError } = await context.supabase
    .from("inventory_transaction_lines")
    .insert(lines)
    .select("*");

  if (isMissingSnapshotColumnError(linesError)) {
    ({ data: lineData, error: linesError } = await context.supabase
      .from("inventory_transaction_lines")
      .insert(stripSnapshotFieldsFromRows(lines))
      .select("*"));
  }

  if (linesError) {
    return serviceFail(400, linesError.message);
  }

  return serviceOk(
    {
      id,
      lines: lineData ?? [],
    },
    200,
  );
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

  const { error: deleteLinesError } = await context.supabase
    .from("inventory_transaction_lines")
    .delete()
    .eq("transaction_id", id);

  if (deleteLinesError) {
    return serviceFail(400, deleteLinesError.message);
  }

  const { error: deleteTransactionError } = await context.supabase
    .from("inventory_transactions")
    .delete()
    .eq("id", id);

  if (deleteTransactionError) {
    return serviceFail(400, deleteTransactionError.message);
  }

  return serviceOk({ success: true });
}

export async function submitInventoryTransaction(context: AuthContext, id: string) {
  const { data: transaction, error: findError } = await context.supabase
    .from("inventory_transactions")
    .select("id, status, source_location_id, destination_location_id")
    .eq("id", id)
    .single<TransactionLookupRow>();

  if (findError || !transaction) {
    return serviceFail(findError ? 404 : 404, findError?.message ?? "Transaction not found.");
  }

  const sourceError = assertLocationAccess(
    context,
    transaction.source_location_id as string | null,
  );
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(
    context,
    transaction.destination_location_id as string | null,
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
    return serviceFail(409, "Only DRAFT transactions can be submitted.");
  }

  const { data, error } = await context.supabase
    .from("inventory_transactions")
    .update({
      status: "SUBMITTED",
      submitted_by: context.user.id,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return serviceFail(400, error.message);
  }

  return serviceOk(data);
}

export async function postInventoryTransaction(context: AuthContext, id: string) {
  const selectTransaction = (includeSnapshots: boolean) =>
    context.supabase
      .from("inventory_transactions")
      .select(
        includeSnapshots
          ? TRANSACTION_POST_SELECT_WITH_SNAPSHOTS
          : TRANSACTION_POST_SELECT_LEGACY,
      )
      .eq("id", id)
      .single();

  let { data: transaction, error: findError } = await selectTransaction(true);
  let typedTransaction = transaction as TransactionPostRecord | null;

  if (isMissingSnapshotColumnError(findError)) {
    ({ data: transaction, error: findError } = await selectTransaction(false));
    typedTransaction = transaction as TransactionPostRecord | null;
  }

  if (findError || !typedTransaction) {
    return serviceFail(findError ? 404 : 404, findError?.message ?? "Transaction not found.");
  }

  const sourceError = assertLocationAccess(context, typedTransaction.source_location_id);
  if (sourceError) {
    return serviceFail(
      sourceError.status,
      await readResponseError(sourceError, "No access to the selected source location."),
    );
  }

  const destinationError = assertLocationAccess(
    context,
    typedTransaction.destination_location_id,
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

  if (typedTransaction.status !== "SUBMITTED") {
    return serviceFail(409, "Only SUBMITTED transactions can be posted.");
  }

  const { data, error } = await context.supabase.rpc("rpc_post_transaction", {
    p_transaction_id: id,
  });

  if (error) {
    return serviceFail(400, error.message);
  }

  const isSupplierDocumentType =
    typedTransaction.type === "RECEIPT" || typedTransaction.type === "RETURN_OUT";
  if (
    isSupplierDocumentType &&
    typedTransaction.supplier_id &&
    typedTransaction.supplier_invoice_number
  ) {
    const { data: lines, error: linesError } = await context.supabase
      .from("inventory_transaction_lines")
      .select("qty, unit_cost")
      .eq("transaction_id", id);

    if (linesError) {
      return serviceFail(400, linesError.message);
    }

    const grossAmount = (lines ?? []).reduce(
      (sum, line: { qty: number; unit_cost: number | null }) =>
        sum + Number(line.qty ?? 0) * Number(line.unit_cost ?? 0),
      0,
    );

    const locationId =
      typedTransaction.type === "RECEIPT"
        ? typedTransaction.destination_location_id
        : typedTransaction.source_location_id;
    if (!locationId) {
      return serviceFail(409, "Supplier document location is missing.");
    }

    const documentType =
      typedTransaction.type === "RECEIPT" ? "INVOICE" : "CREDIT_NOTE";
    const documentDate =
      typedTransaction.supplier_invoice_date ??
      String(typedTransaction.created_at ?? "").slice(0, 10);

    const supplierDocument = {
      supplier_id: typedTransaction.supplier_id,
      supplier_code_snapshot: typedTransaction.supplier_code_snapshot ?? null,
      supplier_name_snapshot: typedTransaction.supplier_name_snapshot ?? null,
      location_id: locationId,
      source_transaction_id: typedTransaction.id,
      document_type: documentType,
      document_number: typedTransaction.supplier_invoice_number,
      document_date: documentDate,
      currency: "KWD",
      gross_amount: grossAmount,
      status: "OPEN",
      created_by: context.user.id,
    };

    let { error: documentError } = await context.supabase
      .from("supplier_documents")
      .upsert(supplierDocument, { onConflict: "source_transaction_id" });

    if (isMissingSnapshotColumnError(documentError)) {
      ({ error: documentError } = await context.supabase
        .from("supplier_documents")
        .upsert(stripSnapshotFields(supplierDocument), {
          onConflict: "source_transaction_id",
        }));
    }

    if (documentError) {
      return serviceFail(400, documentError.message);
    }
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
