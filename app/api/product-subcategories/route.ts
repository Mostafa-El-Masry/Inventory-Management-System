import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
import {
  nextSubcategoryCode,
  normalizeTaxonomyName,
} from "@/lib/products/taxonomy";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productSubcategoryCreateSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const categoryId = new URL(request.url).searchParams.get("category_id");

  let query = context.supabase
    .from("product_subcategories")
    .select(
      `
        id,
        category_id,
        code,
        name,
        is_active,
        category:product_categories!product_subcategories_category_id_fkey(id, code, name)
      `,
    )
    .order("name", { ascending: true });

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) {
    return fail(error.message, 400);
  }

  const items = ((data ?? []) as Array<Record<string, unknown>>).map((item) => {
    const categoryRaw = item.category;
    const category =
      Array.isArray(categoryRaw) ? (categoryRaw[0] ?? null) : categoryRaw ?? null;

    return {
      ...item,
      category,
      category_name:
        category && typeof category === "object" && "name" in category
          ? String(category.name)
          : null,
    };
  });

  return ok({ items });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const permissionError = assertMasterPermission(context, "subcategories", "create");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, productSubcategoryCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const normalizedName = normalizeTaxonomyName(payload.data.name);
  const categoryId = payload.data.category_id;

  const { data: category, error: categoryError } = await writeClient
    .from("product_categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle();
  if (categoryError) {
    return fail(categoryError.message, 400);
  }
  if (!category) {
    return fail("Category not found.", 404);
  }

  const { data: existingRows, error: existingError } = await writeClient
    .from("product_subcategories")
    .select("id, code, name")
    .eq("category_id", categoryId);
  if (existingError) {
    return fail(existingError.message, 400);
  }

  if (
    (existingRows ?? []).some(
      (row: { name: string }) => normalizeTaxonomyName(row.name) === normalizedName,
    )
  ) {
    return fail("Subcategory name already exists in this category.", 409);
  }

  const nextCode = nextSubcategoryCode(
    (existingRows ?? []).map((row: { code: string }) => row.code),
  );
  if (!nextCode) {
    return fail("Subcategory code space exhausted for this category.", 409);
  }

  const { data, error } = await writeClient
    .from("product_subcategories")
    .insert({
      category_id: categoryId,
      code: nextCode,
      name: payload.data.name.trim(),
      is_active: payload.data.is_active,
    })
    .select("id, category_id, code, name, is_active")
    .single();

  if (error) {
    if (error.code === "23505") {
      return fail("Subcategory already exists in this category.", 409);
    }
    return fail(error.message, 400);
  }

  return ok(data, 201);
}
