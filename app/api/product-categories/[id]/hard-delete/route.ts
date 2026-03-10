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

  const permissionError = assertMasterPermission(context, "categories", "delete");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const { id } = await params;

  const { count: subcategoryCount, error: subcategoryCountError } = await writeClient
    .from("product_subcategories")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (subcategoryCountError) {
    return fail(subcategoryCountError.message, 400);
  }

  if ((subcategoryCount ?? 0) > 0) {
    return fail("Cannot hard delete category with linked subcategories.", 409, {
      field: "category_id",
      category_id: id,
    });
  }

  const { count: productCount, error: productCountError } = await writeClient
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (productCountError) {
    return fail(productCountError.message, 400);
  }

  if ((productCount ?? 0) > 0) {
    return fail("Cannot hard delete category with linked products.", 409, {
      field: "category_id",
      category_id: id,
    });
  }

  const { data, error } = await writeClient
    .from("product_categories")
    .delete()
    .eq("id", id)
    .select("id, code, name, is_active")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return fail("Cannot hard delete category while linked records still exist.", 409);
    }
    return fail(error.message, 400);
  }

  if (!data) {
    return fail("Category not found.", 404);
  }

  return ok(data);
}
