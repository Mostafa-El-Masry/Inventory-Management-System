import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/utils/http";

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

  return ok({ success: true, profile: data });
}
