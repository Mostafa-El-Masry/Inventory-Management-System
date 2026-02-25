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
    .select("id, status, source_location_id, destination_location_id")
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

  return ok({ success: true, result: data });
}
