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

  const permissionError = assertMasterPermission(context, "subcategories", "archive");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const { id } = await params;
  const { data, error } = await writeClient
    .from("product_subcategories")
    .update({ is_active: false })
    .eq("id", id)
    .select("id, category_id, code, name, is_active")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
