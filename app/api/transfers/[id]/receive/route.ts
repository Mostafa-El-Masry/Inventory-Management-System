import { assertRole, getAuthContext } from "@/lib/auth/permissions";
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
  const { data, error } = await context.supabase.rpc("rpc_receive_transfer", {
    p_transfer_id: id,
  });

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ success: true, result: data });
}
