import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import {
  isMissingSnapshotColumnError,
  stripSnapshotFieldsFromRows,
} from "@/lib/supabase/snapshot-schema-compat";
import { transferCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

const DIRECT_NOTE_PREFIX = "[DIRECT]";

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

export async function POST(request: Request) {
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

  const trimmedNotes = payload.data.notes?.trim();
  const notes = trimmedNotes
    ? `${DIRECT_NOTE_PREFIX} ${trimmedNotes}`
    : DIRECT_NOTE_PREFIX;

  const { data: transfer, error: transferError } = await context.supabase
    .from("transfers")
    .insert({
      transfer_number: `TR-${Date.now()}`,
      from_location_id: payload.data.from_location_id,
      to_location_id: payload.data.to_location_id,
      status: "APPROVED",
      notes,
      requested_by: context.user.id,
      approved_by: context.user.id,
      approved_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (transferError || !transfer) {
    return fail(transferError?.message ?? "Failed to create direct transfer.", 400);
  }

  const transferLines = payload.data.lines.map((line) => {
    const product = productById.get(line.product_id);

    return {
      transfer_id: transfer.id,
      product_id: line.product_id,
      product_sku_snapshot: product?.sku ?? null,
      product_name_snapshot: product?.name ?? null,
      product_barcode_snapshot: product?.barcode ?? null,
      requested_qty: line.requested_qty,
      dispatched_qty: 0,
      received_qty: 0,
    };
  });

  let { error: linesError } = await context.supabase
    .from("transfer_lines")
    .insert(transferLines);

  if (isMissingSnapshotColumnError(linesError)) {
    ({ error: linesError } = await context.supabase
      .from("transfer_lines")
      .insert(stripSnapshotFieldsFromRows(transferLines)));
  }

  if (linesError) {
    return fail(linesError.message, 400);
  }

  const { error: dispatchError } = await context.supabase.rpc("rpc_dispatch_transfer", {
    p_transfer_id: transfer.id,
  });
  if (dispatchError) {
    return fail(`Direct transfer dispatch failed: ${dispatchError.message}`, 400);
  }

  const { error: receiveError } = await context.supabase.rpc("rpc_receive_transfer", {
    p_transfer_id: transfer.id,
  });
  if (receiveError) {
    return fail(
      `Direct transfer receive failed: ${receiveError.message}. Transfer remains DISPATCHED and can be received manually.`,
      400,
    );
  }

  const { data, error } = await context.supabase
    .from("transfers")
    .select("*, transfer_lines(*)")
    .eq("id", transfer.id)
    .single();

  if (error || !data) {
    return fail(error?.message ?? "Failed to load direct transfer.", 400);
  }

  return ok(data, 201);
}
