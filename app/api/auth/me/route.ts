import { getAuthContext } from "@/lib/auth/permissions";
import { ok } from "@/lib/utils/http";

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  return ok({
    user_id: context.user.id,
    role: context.profile.role,
    is_active: context.profile.is_active,
    location_ids: context.locationIds,
    capabilities: context.capabilities,
  });
}
