import { getSettingsTestDefaults } from "@/lib/admin/settings-test-actions";
import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import type { SettingsTestDefaultsResponse } from "@/lib/types/api";
import { fail, ok } from "@/lib/utils/http";

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const smokeDefaults = await getSettingsTestDefaults(context);

  if (!smokeDefaults.ok) {
    return fail(smokeDefaults.error, smokeDefaults.status);
  }

  const response: SettingsTestDefaultsResponse = {
    transfer: smokeDefaults.data.transfer,
    consumption: smokeDefaults.data.consumption,
  };

  return ok(response);
}
