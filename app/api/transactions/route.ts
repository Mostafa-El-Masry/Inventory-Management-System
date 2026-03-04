import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { transactionCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  let query = context.supabase
    .from("inventory_transactions")
    .select(
      "*, inventory_transaction_lines(id, product_id, qty, lot_number, expiry_date, unit_cost, reason_code)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }
  if (type) {
    query = query.eq("type", type);
  }

  if (context.profile.role !== "admin") {
    if (context.locationIds.length === 0) {
      return ok({ items: [] });
    }

    const locFilter = context.locationIds.join(",");
    query = query.or(
      `source_location_id.in.(${locFilter}),destination_location_id.in.(${locFilter})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager", "staff"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, transactionCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const normalizedSupplierInvoiceNumber =
    payload.data.supplier_invoice_number?.trim() || null;

  if (payload.data.supplier_id) {
    const { data: supplier, error: supplierError } = await context.supabase
      .from("suppliers")
      .select("id, is_active")
      .eq("id", payload.data.supplier_id)
      .maybeSingle();

    if (supplierError) {
      return fail(supplierError.message, 400);
    }

    if (!supplier) {
      return fail("Supplier not found.", 404);
    }

    if (!supplier.is_active) {
      return fail("Supplier is archived and cannot be used for new transactions.", 409);
    }
  }

  const sourceError = assertLocationAccess(
    context,
    payload.data.source_location_id ?? null,
  );
  if (sourceError) {
    return sourceError;
  }

  const destinationError = assertLocationAccess(
    context,
    payload.data.destination_location_id ?? null,
  );
  if (destinationError) {
    return destinationError;
  }

  const txRecord = {
    tx_number: `TX-${Date.now()}`,
    type: payload.data.type,
    status: "DRAFT",
    source_location_id: payload.data.source_location_id ?? null,
    destination_location_id: payload.data.destination_location_id ?? null,
    reference_type: payload.data.reference_type ?? null,
    reference_id: payload.data.reference_id ?? null,
    supplier_id: payload.data.supplier_id ?? null,
    supplier_invoice_number: normalizedSupplierInvoiceNumber,
    supplier_invoice_date: payload.data.supplier_invoice_date ?? null,
    notes: payload.data.notes ?? null,
    created_by: context.user.id,
  };

  const { data: transaction, error: transactionError } = await context.supabase
    .from("inventory_transactions")
    .insert(txRecord)
    .select("*")
    .single();

  if (transactionError || !transaction) {
    return fail(transactionError?.message ?? "Failed to create transaction.", 400);
  }

  const lines = payload.data.lines.map((line) => ({
    transaction_id: transaction.id,
    ...line,
  }));

  const { data: lineData, error: linesError } = await context.supabase
    .from("inventory_transaction_lines")
    .insert(lines)
    .select("*");

  if (linesError) {
    return fail(linesError.message, 400);
  }

  return ok(
    {
      ...transaction,
      lines: lineData ?? [],
    },
    201,
  );
}
