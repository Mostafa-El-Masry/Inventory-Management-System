import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
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

  const permissionError = assertMasterPermission(context, "categories", "archive");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const { id } = await params;
  const { data, error } = await writeClient
    .from("product_categories")
    .update({ is_active: true })
    .eq("id", id)
    .select("id, code, name, is_active")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
