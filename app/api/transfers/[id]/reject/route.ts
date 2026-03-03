import { z } from "zod";

import {
  assertLocationAccess,
  assertRole,
  getAuthContext,
} from "@/lib/auth/permissions";
import { fail, ok, parseBody } from "@/lib/utils/http";

const transferRejectSchema = z.object({
  note: z.string().max(240).optional(),
});

export async function POST(
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

  const payload = await parseBody(request, transferRejectSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id } = await params;
  const { data: transfer, error: transferError } = await context.supabase
    .from("transfers")
    .select("id, status, notes, from_location_id, to_location_id")
    .eq("id", id)
    .single();

  if (transferError || !transfer) {
    return fail(transferError?.message ?? "Transfer not found.", 404);
  }

  const sourceError = assertLocationAccess(
    context,
    transfer.from_location_id as string | null,
  );
  if (sourceError) {
    return sourceError;
  }

  const destinationError = assertLocationAccess(
    context,
    transfer.to_location_id as string | null,
  );
  if (destinationError) {
    return destinationError;
  }

  if (!["REQUESTED", "APPROVED"].includes(transfer.status)) {
    return fail("Only REQUESTED or APPROVED transfers can be rejected.", 409);
  }

  const reason = payload.data.note?.trim();
  const rejectionNote = reason ? `[REJECTED] ${reason}` : "[REJECTED]";
  const updatedNotes = transfer.notes
    ? `${transfer.notes}\n${rejectionNote}`
    : rejectionNote;

  const { data, error } = await context.supabase
    .from("transfers")
    .update({
      status: "REJECTED",
      notes: updatedNotes,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
