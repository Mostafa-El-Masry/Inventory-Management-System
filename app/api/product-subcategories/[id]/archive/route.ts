import { assertRole, getAuthContext } from "@/lib/auth/permissions";
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
  const { data, error } = await context.supabase
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
