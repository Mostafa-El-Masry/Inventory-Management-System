import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { reverseTransactionSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

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

  const payload = await parseBody(request, reverseTransactionSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id } = await params;
  const { data, error } = await context.supabase.rpc("rpc_reverse_transaction", {
    p_transaction_id: id,
    p_reason: payload.data.reason,
  });

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ success: true, result: data });
}
