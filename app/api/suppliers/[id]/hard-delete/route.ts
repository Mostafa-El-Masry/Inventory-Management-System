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

  const permissionError = assertMasterPermission(context, "suppliers", "delete");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const { id } = await params;

  const { count: documentCount, error: documentCountError } = await writeClient
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

  const { data, error } = await writeClient
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
