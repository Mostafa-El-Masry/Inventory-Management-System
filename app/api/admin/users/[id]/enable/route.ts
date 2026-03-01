import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/utils/http";

const AUTH_UNBAN_DURATION = "none";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: true })
    .eq("id", id)
    .select("id, full_name, role, is_active, created_at, updated_at")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: AUTH_UNBAN_DURATION,
  });

  if (unbanError) {
    console.error("[AUTH] Failed to unban enabled user", {
      user_id: id,
      error: unbanError.message,
      route: "admin/users/[id]/enable",
    });
    return fail("User was enabled, but auth unban failed.", 500);
  }

  return ok({ success: true, profile: data });
}
