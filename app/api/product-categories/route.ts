import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
import {
  nextCategoryCode,
  normalizeTaxonomyName,
} from "@/lib/products/taxonomy";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productCategoryCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET() {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const { data, error } = await context.supabase
    .from("product_categories")
    .select("id, code, name, is_active")
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

  const permissionError = assertMasterPermission(context, "categories", "create");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, productCategoryCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const normalizedName = normalizeTaxonomyName(payload.data.name);

  const { data: existingRows, error: existingError } = await writeClient
    .from("product_categories")
    .select("id, code, name");
  if (existingError) {
    return fail(existingError.message, 400);
  }

  if (
    (existingRows ?? []).some(
      (row: { name: string }) => normalizeTaxonomyName(row.name) === normalizedName,
    )
  ) {
    return fail("Category name already exists.", 409);
  }

  const nextCode = nextCategoryCode(
    (existingRows ?? []).map((row: { code: string }) => row.code),
  );
  if (!nextCode) {
    return fail("Category code space exhausted.", 409);
  }

  const { data, error } = await writeClient
    .from("product_categories")
    .insert({
      code: nextCode,
      name: payload.data.name.trim(),
      is_active: payload.data.is_active,
    })
    .select("id, code, name, is_active")
    .single();

  if (error) {
    if (error.code === "23505") {
      return fail("Category already exists.", 409);
    }
    return fail(error.message, 400);
  }

  return ok(data, 201);
}
