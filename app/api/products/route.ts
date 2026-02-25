import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { productCreateSchema, productPatchSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const { data, error } = await context.supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, productCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { data, error } = await context.supabase
    .from("products")
    .insert(payload.data)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data, 201);
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin", "manager"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, productPatchSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id, ...updates } = payload.data;
  const { data, error } = await context.supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  return ok(data);
}
