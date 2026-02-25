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
  const { data: transfer, error: transferError } = await context.supabase
    .from("transfers")
    .select("id, status, from_location_id, to_location_id")
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

  if (transfer.status !== "REQUESTED") {
    return fail("Only REQUESTED transfers can be approved.", 409);
  }

  const { data, error } = await context.supabase
    .from("transfers")
    .update({
      status: "APPROVED",
      approved_by: context.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
