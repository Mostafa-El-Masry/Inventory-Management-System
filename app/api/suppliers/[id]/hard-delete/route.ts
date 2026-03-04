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

  const { count: documentCount, error: documentCountError } = await context.supabase
    .from("supplier_documents")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", id);

  if (documentCountError) {
    return fail(documentCountError.message, 400);
  }

  if ((documentCount ?? 0) > 0) {
    return fail("Cannot hard delete supplier with linked documents.", 409, {
      field: "supplier_id",
      supplier_id: id,
    });
  }

  const { data, error } = await context.supabase
    .from("suppliers")
    .delete()
    .eq("id", id)
    .select("id, code, name, phone, email, is_active, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return fail("Cannot hard delete supplier while linked records still exist.", 409);
    }
    return fail(error.message, 400);
  }

  if (!data) {
    return fail("Supplier not found.", 404);
  }

  return ok(data);
}
