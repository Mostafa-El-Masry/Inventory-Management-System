import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { runSettingsTestAction } from "@/lib/admin/settings-test-actions";
import { settingsTestActionSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, settingsTestActionSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const result = await runSettingsTestAction(context, payload.data);
  if (!result.ok) {
    return fail(result.error, result.status);
  }

  return ok(result.data, result.status);
}
