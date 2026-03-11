import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { receiveTransfer } from "@/lib/transfers/mutations";
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
  const result = await receiveTransfer(context, id);
  if (!result.ok) {
    return fail(result.error, result.status);
  }

  return ok(result.data);
}
