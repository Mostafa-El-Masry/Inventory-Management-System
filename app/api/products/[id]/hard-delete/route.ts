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
  const { count, error: linkedError } = await context.supabase
    .from("inventory_transaction_lines")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  if (linkedError) {
    return fail(linkedError.message, 400);
  }

  if ((count ?? 0) > 0) {
    return fail("Cannot hard delete product with linked transactions.", 409, {
      field: "product_id",
      product_id: id,
    });
  }

  const { data, error } = await context.supabase
    .from("products")
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return fail("Cannot hard delete product while linked records still exist.", 409);
    }
    return fail(error.message, 400);
  }

  if (!data) {
    return fail("Product not found.", 404);
  }

  return ok(data);
}
