import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import {
  approveTransfer,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
} from "@/lib/transfers/mutations";
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

  const trimmedNotes = payload.data.notes?.trim();
  const notes = trimmedNotes
    ? `${DIRECT_NOTE_PREFIX} ${trimmedNotes}`
    : DIRECT_NOTE_PREFIX;

  const created = await createTransfer(context, {
    from_location_id: payload.data.from_location_id,
    to_location_id: payload.data.to_location_id,
    notes,
    lines: payload.data.lines,
  });
  if (!created.ok) {
    return fail(created.error, created.status);
  }

  const approved = await approveTransfer(context, String(created.data.id));
  if (!approved.ok) {
    return fail(`Direct transfer approval failed: ${approved.error}`, approved.status);
  }

  const dispatched = await dispatchTransfer(context, String(created.data.id));
  if (!dispatched.ok) {
    return fail(`Direct transfer dispatch failed: ${dispatched.error}`, dispatched.status);
  }

  const received = await receiveTransfer(context, String(created.data.id));
  if (!received.ok) {
    return fail(
      `Direct transfer receive failed: ${received.error}. Transfer remains DISPATCHED and can be received manually.`,
      received.status,
    );
  }

  const { data, error } = await context.supabase
    .from("transfers")
    .select("*, transfer_lines(*)")
    .eq("id", created.data.id)
    .single();

  if (error || !data) {
    return fail(error?.message ?? "Failed to load direct transfer.", 400);
  }

  return ok(data, 201);
}
