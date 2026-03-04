import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { fail, ok } from "@/lib/utils/http";

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
  const { data: transaction, error: findError } = await context.supabase
    .from("inventory_transactions")
    .select(
      "id, tx_number, type, status, source_location_id, destination_location_id, supplier_id, supplier_invoice_number, supplier_invoice_date, created_at",
    )
    .eq("id", id)
    .single();

  if (findError || !transaction) {
    return fail(findError?.message ?? "Transaction not found.", 404);
  }

  const sourceError = assertLocationAccess(
    context,
    transaction.source_location_id as string | null,
  );
  if (sourceError) {
    return sourceError;
  }

  const destinationError = assertLocationAccess(
    context,
    transaction.destination_location_id as string | null,
  );
  if (destinationError) {
    return destinationError;
  }

  if (transaction.status !== "SUBMITTED") {
    return fail("Only SUBMITTED transactions can be posted.", 409);
  }

  const { data, error } = await context.supabase.rpc("rpc_post_transaction", {
    p_transaction_id: id,
  });

  if (error) {
    return fail(error.message, 400);
  }

  const isSupplierDocumentType =
    transaction.type === "RECEIPT" || transaction.type === "RETURN_OUT";
  if (
    isSupplierDocumentType &&
    transaction.supplier_id &&
    transaction.supplier_invoice_number
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
      transaction.type === "RECEIPT"
        ? transaction.destination_location_id
        : transaction.source_location_id;
    if (!locationId) {
      return fail("Supplier document location is missing.", 409);
    }

    const documentType =
      transaction.type === "RECEIPT" ? "INVOICE" : "CREDIT_NOTE";
    const documentDate =
      transaction.supplier_invoice_date ??
      String(transaction.created_at ?? "").slice(0, 10);

    const { error: documentError } = await context.supabase
      .from("supplier_documents")
      .upsert(
        {
          supplier_id: transaction.supplier_id,
          location_id: locationId,
          source_transaction_id: transaction.id,
          document_type: documentType,
          document_number: transaction.supplier_invoice_number,
          document_date: documentDate,
          currency: "KWD",
          gross_amount: grossAmount,
          status: "OPEN",
          created_by: context.user.id,
        },
        { onConflict: "source_transaction_id" },
      );

    if (documentError) {
      return fail(documentError.message, 400);
    }
  }

  return ok({ success: true, result: data });
}
