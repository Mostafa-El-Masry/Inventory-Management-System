import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userPatchSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, userPatchSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id, ...updates } = payload.data;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select("id, full_name, role, is_active, created_at, updated_at")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
