import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { transferCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

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

  const transferLines = payload.data.lines.map((line) => ({
    transfer_id: id,
    product_id: line.product_id,
    requested_qty: line.requested_qty,
    dispatched_qty: 0,
    received_qty: 0,
  }));

  const { error: lineInsertError } = await context.supabase
    .from("transfer_lines")
    .insert(transferLines);

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
