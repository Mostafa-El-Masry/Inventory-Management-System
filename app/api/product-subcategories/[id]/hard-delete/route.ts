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

  const { count: productCount, error: productCountError } = await context.supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("subcategory_id", id);

  if (productCountError) {
    return fail(productCountError.message, 400);
  }

  if ((productCount ?? 0) > 0) {
    return fail("Cannot hard delete subcategory with linked products.", 409, {
      field: "subcategory_id",
      subcategory_id: id,
    });
  }

  const { data, error } = await context.supabase
    .from("product_subcategories")
    .delete()
    .eq("id", id)
    .select("id, category_id, code, name, is_active")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return fail("Cannot hard delete subcategory while linked records still exist.", 409);
    }
    return fail(error.message, 400);
  }

  if (!data) {
    return fail("Subcategory not found.", 404);
  }

  return ok(data);
}
