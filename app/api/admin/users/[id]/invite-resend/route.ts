import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/utils/http";

function errorResponseMessage(message: string) {
  if (message.toLowerCase().includes("not found")) {
    return { status: 404, message: "User account was not found." };
  }
  return { status: 400, message };
}

export async function POST(
  request: Request,
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
  const origin = new URL(request.url).origin;
  const redirectTo = `${origin}/auth/callback?next=/auth/set-password`;

  const [profileResult, userResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("id", id)
      .maybeSingle<{ id: string; full_name: string }>(),
    supabaseAdmin.auth.admin.getUserById(id),
  ]);

  if (profileResult.error) {
    return fail(profileResult.error.message, 400);
  }
  if (!profileResult.data) {
    return fail("User profile was not found.", 404);
  }

  if (userResult.error || !userResult.data.user) {
    const normalized = errorResponseMessage(
      userResult.error?.message ?? "User account was not found.",
    );
    return fail(normalized.message, normalized.status);
  }

  const email = userResult.data.user.email;
  if (!email) {
    return fail("User account does not have an email address.", 422);
  }

  const inviteResult = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: profileResult.data.full_name },
  });

  if (inviteResult.error) {
    // Fallback for already-registered users: send reset-password email.
    const resetResult = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (resetResult.error) {
      return fail(resetResult.error.message, 400);
    }
  }

  return ok({ success: true, email });
}
