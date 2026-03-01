import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/utils/http";

const AUTH_BAN_DURATION = "876000h";

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
  if (id === context.user.id) {
    return fail("You cannot disable your own account.", 409);
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      role: string;
      is_active: boolean;
    }>();

  if (targetError) {
    return fail(targetError.message, 400);
  }
  if (!target) {
    return fail("User profile was not found.", 404);
  }

  if (target.role === "admin" && target.is_active) {
    const { count, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .eq("role", "admin")
      .eq("is_active", true);

    if (countError) {
      return fail(countError.message, 400);
    }
    if ((count ?? 0) <= 1) {
      return fail("At least one active admin is required.", 409);
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", id)
    .select("id, full_name, role, is_active, created_at, updated_at")
    .single();

  if (profileError) {
    return fail(profileError.message, 400);
  }

  const { error: revokeError } = await supabaseAdmin
    .from("user_location_access")
    .delete()
    .eq("user_id", id);

  if (revokeError) {
    return fail(revokeError.message, 400);
  }

  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: AUTH_BAN_DURATION,
  });

  if (banError) {
    console.error("[AUTH] Failed to ban disabled user", {
      user_id: id,
      error: banError.message,
      route: "admin/users/[id]/disable",
    });
    return fail("User was disabled, but auth ban failed.", 500);
  }

  return ok({ success: true, profile });
}
