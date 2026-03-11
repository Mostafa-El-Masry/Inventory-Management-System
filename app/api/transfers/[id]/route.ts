import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import {
  isMissingSnapshotColumnError,
  stripSnapshotFieldsFromRows,
} from "@/lib/supabase/snapshot-schema-compat";
import type {
  TransferDetailRecord,
  TransferDetailResponse,
  TransferLineDetail,
} from "@/lib/types/api";
import { transferCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

type TransferLineRow = {
  id: string;
  product_id: string;
  product_sku_snapshot?: string | null;
  product_name_snapshot?: string | null;
  product_barcode_snapshot?: string | null;
  requested_qty: number;
  dispatched_qty: number;
  received_qty: number;
};

type TransferRow = {
  id: string;
  transfer_number: string;
  status: string;
  from_location_id: string;
  to_location_id: string;
  notes: string | null;
  created_at: string;
  transfer_lines?: TransferLineRow[] | null;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  barcode: string | null;
};

type LocationRow = {
  id: string;
  code: string | null;
  name: string | null;
};

function normalizeDisplayValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const { id } = await params;

  const { data: transfer, error } = await context.supabase
    .from("transfers")
    .select("*, transfer_lines(*)")
    .eq("id", id)
    .maybeSingle<TransferRow>();

  if (error) {
    return fail(error.message, 400);
  }

  if (!transfer) {
    return fail("Transfer not found.", 404);
  }

  if (
    context.profile.role !== "admin" &&
    ![transfer.from_location_id, transfer.to_location_id].some((locationId) =>
      context.locationIds.includes(locationId),
    )
  ) {
    return fail("No access to this transfer.", 403);
  }

  const productIds = Array.from(
    new Set((transfer.transfer_lines ?? []).map((line) => line.product_id)),
  );
  const locationIds = Array.from(
    new Set([transfer.from_location_id, transfer.to_location_id]),
  );

  const [productResult, locationResult] = await Promise.all([
    productIds.length > 0
      ? context.supabase
          .from("products")
          .select("id, sku, name, barcode")
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    context.supabase.from("locations").select("id, code, name").in("id", locationIds),
  ]);

  if (productResult.error) {
    return fail(productResult.error.message, 400);
  }

  if (locationResult.error) {
    return fail(locationResult.error.message, 400);
  }

  const productById = new Map(
    ((productResult.data ?? []) as ProductRow[]).map((product) => [product.id, product]),
  );
  const locationById = new Map(
    ((locationResult.data ?? []) as LocationRow[]).map((location) => [
      location.id,
      location,
    ]),
  );

  const lines: TransferLineDetail[] = (transfer.transfer_lines ?? []).map((line) => {
    const product = productById.get(line.product_id);
    return {
      id: line.id,
      product_id: line.product_id,
      product_display_code:
        normalizeDisplayValue(line.product_sku_snapshot) ??
        normalizeDisplayValue(product?.sku) ??
        null,
      product_display_name:
        normalizeDisplayValue(line.product_name_snapshot) ??
        normalizeDisplayValue(product?.name) ??
        null,
      product_barcode:
        normalizeDisplayValue(line.product_barcode_snapshot) ??
        normalizeDisplayValue(product?.barcode) ??
        null,
      requested_qty: Number(line.requested_qty ?? 0),
      dispatched_qty: Number(line.dispatched_qty ?? 0),
      received_qty: Number(line.received_qty ?? 0),
    };
  });

  const item: TransferDetailRecord = {
    id: transfer.id,
    transfer_number: transfer.transfer_number,
    status: transfer.status,
    created_at: transfer.created_at,
    notes: normalizeDisplayValue(transfer.notes),
    source_location: (() => {
      const location = locationById.get(transfer.from_location_id);
      return location
        ? {
            id: location.id,
            code: normalizeDisplayValue(location.code),
            name: normalizeDisplayValue(location.name),
          }
        : null;
    })(),
    destination_location: (() => {
      const location = locationById.get(transfer.to_location_id);
      return location
        ? {
            id: location.id,
            code: normalizeDisplayValue(location.code),
            name: normalizeDisplayValue(location.name),
          }
        : null;
    })(),
    lines,
    total_requested_qty: lines.reduce((total, line) => total + line.requested_qty, 0),
    total_dispatched_qty: lines.reduce((total, line) => total + line.dispatched_qty, 0),
    total_received_qty: lines.reduce((total, line) => total + line.received_qty, 0),
  };

  return ok<TransferDetailResponse>({ item });
}

function hasDuplicateProducts(lines: Array<{ product_id: string }>) {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.product_id)) {
      return true;
    }
    seen.add(line.product_id);
  }
  return false;
}

export async function PATCH(
  request: Request,
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

  const payload = await parseBody(request, transferCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  if (hasDuplicateProducts(payload.data.lines)) {
    return fail("Duplicate products are not allowed in transfer lines.", 422);
  }

  const sourceError = assertLocationAccess(context, payload.data.from_location_id);
  if (sourceError) {
    return sourceError;
  }

  const destinationError = assertLocationAccess(context, payload.data.to_location_id);
  if (destinationError) {
    return destinationError;
  }

  if (payload.data.from_location_id === payload.data.to_location_id) {
    return fail("Transfer source and destination must be different.", 422);
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

  const { id } = await params;

  const { data: existingTransfer, error: existingError } = await context.supabase
    .from("transfers")
    .select("id, status")
    .eq("id", id)
    .single();

  if (existingError || !existingTransfer) {
    return fail(existingError?.message ?? "Transfer not found.", 404);
  }

  if (existingTransfer.status !== "REQUESTED") {
    return fail("Only REQUESTED transfers can be edited.", 409);
  }

  const { error: transferUpdateError } = await context.supabase
    .from("transfers")
    .update({
      from_location_id: payload.data.from_location_id,
      to_location_id: payload.data.to_location_id,
      notes: payload.data.notes ?? null,
    })
    .eq("id", id);

  if (transferUpdateError) {
    return fail(transferUpdateError.message, 400);
  }

  const { error: lineDeleteError } = await context.supabase
    .from("transfer_lines")
    .delete()
    .eq("transfer_id", id);

  if (lineDeleteError) {
    return fail(lineDeleteError.message, 400);
  }

  const transferLines = payload.data.lines.map((line) => {
    const product = productById.get(line.product_id);

    return {
      transfer_id: id,
      product_id: line.product_id,
      product_sku_snapshot: product?.sku ?? null,
      product_name_snapshot: product?.name ?? null,
      product_barcode_snapshot: product?.barcode ?? null,
      requested_qty: line.requested_qty,
      dispatched_qty: 0,
      received_qty: 0,
    };
  });

  let { error: lineInsertError } = await context.supabase
    .from("transfer_lines")
    .insert(transferLines);

  if (isMissingSnapshotColumnError(lineInsertError)) {
    ({ error: lineInsertError } = await context.supabase
      .from("transfer_lines")
      .insert(stripSnapshotFieldsFromRows(transferLines)));
  }

  if (lineInsertError) {
    return fail(lineInsertError.message, 400);
  }

  const { data, error } = await context.supabase
    .from("transfers")
    .select("*, transfer_lines(*)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return fail(error?.message ?? "Failed to load updated transfer.", 400);
  }

  return ok(data);
}
