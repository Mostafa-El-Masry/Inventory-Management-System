import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { createProductWithGeneratedSku } from "@/lib/products/create";
import {
  findConflictingProduct,
  mapProductUniqueViolation,
} from "@/lib/products/uniqueness";
import { productCreateSchema, productPatchSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

function pickRelation<T extends Record<string, unknown>>(
  value: T | T[] | null | undefined,
) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const includeInactive =
    new URL(request.url).searchParams.get("include_inactive") === "true";

  let query = context.supabase
    .from("products")
    .select(
      `
        id,
        sku,
        barcode,
        name,
        description,
        unit,
        is_active,
        created_at,
        updated_at,
        category_id,
        subcategory_id,
        category:product_categories!products_category_id_fkey(id, code, name),
        subcategory:product_subcategories!products_subcategory_id_fkey(id, category_id, code, name)
      `,
    )
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    return fail(error.message, 400);
  }

  type ProductItem = Record<string, unknown> & {
    id: string;
    category: Record<string, unknown> | null;
    subcategory: Record<string, unknown> | null;
    category_code: string | null;
    category_name: string | null;
    subcategory_code: string | null;
    subcategory_name: string | null;
    can_hard_delete?: boolean;
  };

  const items: ProductItem[] = ((data ?? []) as Array<Record<string, unknown>>).map(
    (item) => {
    const category = pickRelation(
      item.category as Record<string, unknown> | Array<Record<string, unknown>> | null,
    );
    const subcategory = pickRelation(
      item.subcategory as Record<string, unknown> | Array<Record<string, unknown>> | null,
    );

    return {
      ...item,
      id: String(item.id),
      category,
      subcategory,
      category_code: typeof category?.code === "string" ? category.code : null,
      category_name: typeof category?.name === "string" ? category.name : null,
      subcategory_code: typeof subcategory?.code === "string" ? subcategory.code : null,
      subcategory_name: typeof subcategory?.name === "string" ? subcategory.name : null,
    };
  },
  );

  if (context.profile.role !== "admin" || items.length === 0) {
    return ok({ items });
  }

  const productIds = items.map((item) => String(item.id));
  const { data: linkedRows, error: linkedError } = await context.supabase
    .from("inventory_transaction_lines")
    .select("product_id")
    .in("product_id", productIds);

  if (linkedError) {
    return fail(linkedError.message, 400);
  }

  const linkedProductIds = new Set(
    (linkedRows ?? []).map((row: { product_id: string }) => row.product_id),
  );

  return ok({
    items: items.map((item) => ({
      ...item,
      can_hard_delete: !linkedProductIds.has(String(item.id)),
    })),
  });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, productCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { name, barcode, description, unit, is_active, category_id, subcategory_id } =
    payload.data;
  const normalizedName = name.trim();
  const normalizedUnit = unit.trim();

  const nameConflict = await findConflictingProduct(context.supabase, {
    name: normalizedName,
  });
  if (nameConflict.error) {
    return fail(nameConflict.error, 400);
  }

  if (nameConflict.conflict?.type === "name") {
    return fail("Product name already exists.", 409, {
      field: "name",
      product_id: nameConflict.conflict.product.id,
    });
  }

  const created = await createProductWithGeneratedSku(context.supabase, {
    name: normalizedName,
    barcode: barcode ?? null,
    description: description ?? null,
    unit: normalizedUnit,
    is_active,
    category_id,
    subcategory_id,
  });

  if (created.error) {
    return fail(created.error, created.status);
  }

  return ok(created.data, created.status);
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const payload = await parseBody(request, productPatchSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { id, ...updates } = payload.data;
  const normalizedUpdates = {
    ...updates,
    name: typeof updates.name === "string" ? updates.name.trim() : updates.name,
    unit: typeof updates.unit === "string" ? updates.unit.trim() : updates.unit,
  };

  const conflictCheck = await findConflictingProduct(context.supabase, {
    name: normalizedUpdates.name ?? null,
    excludeId: id,
  });
  if (conflictCheck.error) {
    return fail(conflictCheck.error, 400);
  }

  if (conflictCheck.conflict) {
    return fail("Product name already exists.", 409, {
      field: "name",
      product_id: conflictCheck.conflict.product.id,
    });
  }

  const { data, error } = await context.supabase
    .from("products")
    .update(normalizedUpdates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const mapped = mapProductUniqueViolation(error);
    if (mapped) {
      return fail(mapped, 409);
    }
    return fail(error.message, 400);
  }

  return ok(data);
}
