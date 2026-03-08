import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import {
  isMissingSnapshotColumnError,
  stripSnapshotFields,
  stripSnapshotFieldsFromRows,
} from "@/lib/supabase/snapshot-schema-compat";
import { transactionCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

const TRANSACTION_SELECT_WITH_SNAPSHOTS =
  "*, inventory_transaction_lines(id, product_id, qty, lot_number, expiry_date, unit_cost, reason_code, product_sku_snapshot, product_name_snapshot, product_barcode_snapshot)";
const TRANSACTION_SELECT_LEGACY =
  "*, inventory_transaction_lines(id, product_id, qty, lot_number, expiry_date, unit_cost, reason_code)";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  const buildQuery = (includeSnapshots: boolean) => {
    let query = context.supabase
      .from("inventory_transactions")
      .select(
        includeSnapshots
          ? TRANSACTION_SELECT_WITH_SNAPSHOTS
          : TRANSACTION_SELECT_LEGACY,
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
      const locFilter = context.locationIds.join(",");
      query = query.or(
        `source_location_id.in.(${locFilter}),destination_location_id.in.(${locFilter})`,
      );
    }

    return query;
  };

  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return ok({ items: [] });
  }

  let { data, error } = await buildQuery(true);
  if (isMissingSnapshotColumnError(error)) {
    ({ data, error } = await buildQuery(false));
  }

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
  let supplierSnapshot: { code: string | null; name: string | null } | null = null;

  if (payload.data.supplier_id) {
    const { data: supplier, error: supplierError } = await context.supabase
      .from("suppliers")
      .select("id, code, name, is_active")
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

    supplierSnapshot = {
      code: supplier.code ?? null,
      name: supplier.name ?? null,
    };
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

  const productIds = Array.from(
    new Set(payload.data.lines.map((line) => line.product_id)),
  );

  const { data: productRows, error: productError } = await context.supabase
    .from("products")
    .select("id, sku, name, barcode")
    .in("id", productIds);

  if (productError) {
    return fail(productError.message, 400);
  }

  const productById = new Map(
    (productRows ?? []).map((product) => [product.id, product]),
  );

  if (productById.size !== productIds.length) {
    return fail("One or more products were not found.", 404);
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
    supplier_code_snapshot: supplierSnapshot?.code ?? null,
    supplier_name_snapshot: supplierSnapshot?.name ?? null,
    supplier_invoice_number: normalizedSupplierInvoiceNumber,
    supplier_invoice_date: payload.data.supplier_invoice_date ?? null,
    notes: payload.data.notes ?? null,
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
    return fail(transactionError?.message ?? "Failed to create transaction.", 400);
  }

  const lines = payload.data.lines.map((line) => {
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
