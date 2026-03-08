import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import {
  isMissingSnapshotColumnError,
  stripSnapshotFields,
} from "@/lib/supabase/snapshot-schema-compat";
import { fail, ok } from "@/lib/utils/http";

const TRANSACTION_POST_SELECT_WITH_SNAPSHOTS =
  "id, tx_number, type, status, source_location_id, destination_location_id, supplier_id, supplier_code_snapshot, supplier_name_snapshot, supplier_invoice_number, supplier_invoice_date, created_at";
const TRANSACTION_POST_SELECT_LEGACY =
  "id, tx_number, type, status, source_location_id, destination_location_id, supplier_id, supplier_invoice_number, supplier_invoice_date, created_at";

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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager"]);
  if (roleError) {
    return roleError;
  }

  const { id } = await params;
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
    return fail(findError?.message ?? "Transaction not found.", 404);
  }

  const sourceError = assertLocationAccess(
    context,
    typedTransaction.source_location_id,
  );
  if (sourceError) {
    return sourceError;
  }

  const destinationError = assertLocationAccess(
    context,
    typedTransaction.destination_location_id,
  );
  if (destinationError) {
    return destinationError;
  }

  if (typedTransaction.status !== "SUBMITTED") {
    return fail("Only SUBMITTED transactions can be posted.", 409);
  }

  const { data, error } = await context.supabase.rpc("rpc_post_transaction", {
    p_transaction_id: id,
  });

  if (error) {
    return fail(error.message, 400);
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
      return fail(linesError.message, 400);
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
      return fail("Supplier document location is missing.", 409);
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
      return fail(documentError.message, 400);
    }
  }

  return ok({ success: true, result: data });
}
