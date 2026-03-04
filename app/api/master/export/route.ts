import { assertRole, getAuthContext } from "@/lib/auth/permissions";
import { MASTER_ENTITIES, type MasterEntity } from "@/lib/master-sync/contracts";
import { toCsv } from "@/lib/utils/csv";
import { fail } from "@/lib/utils/http";

function parseEntity(raw: string | null): MasterEntity | null {
  if (!raw) {
    return null;
  }

  return MASTER_ENTITIES.includes(raw as MasterEntity) ? (raw as MasterEntity) : null;
}

function parseIncludeInactive(raw: string | null) {
  if (raw === null) {
    return true;
  }

  return raw === "true";
}

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

  const roleError = assertRole(context, ["admin"]);
  if (roleError) {
    return roleError;
  }

  const url = new URL(request.url);
  const entity = parseEntity(url.searchParams.get("entity"));
  if (!entity) {
    return fail(
      "Invalid entity. Use one of: locations, products, categories, subcategories, suppliers.",
      422,
    );
  }

  const includeInactive = parseIncludeInactive(url.searchParams.get("include_inactive"));

  let rows: Record<string, unknown>[] = [];

  if (entity === "locations") {
    let query = context.supabase
      .from("locations")
      .select("code, name, timezone, is_active")
      .order("code", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return fail(error.message, 400);
    }

    rows = (data ?? []).map((item: Record<string, unknown>) => ({
      code: String(item.code ?? ""),
      name: String(item.name ?? ""),
      timezone: String(item.timezone ?? "UTC"),
      is_active: Boolean(item.is_active),
    }));
  }

  if (entity === "suppliers") {
    let query = context.supabase
      .from("suppliers")
      .select("code, name, phone, email, is_active")
      .order("code", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return fail(error.message, 400);
    }

    rows = (data ?? []).map((item: Record<string, unknown>) => ({
      code: String(item.code ?? ""),
      name: String(item.name ?? ""),
      phone: item.phone ? String(item.phone) : "",
      email: item.email ? String(item.email) : "",
      is_active: Boolean(item.is_active),
    }));
  }

  if (entity === "categories") {
    let query = context.supabase
      .from("product_categories")
      .select("code, name, is_active")
      .order("code", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return fail(error.message, 400);
    }

    rows = (data ?? []).map((item: Record<string, unknown>) => ({
      code: String(item.code ?? ""),
      name: String(item.name ?? ""),
      is_active: Boolean(item.is_active),
    }));
  }

  if (entity === "subcategories") {
    let query = context.supabase
      .from("product_subcategories")
      .select(
        "code, name, is_active, category:product_categories!product_subcategories_category_id_fkey(code)",
      )
      .order("category_id", { ascending: true })
      .order("code", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return fail(error.message, 400);
    }

    rows = (data ?? []).map((item: Record<string, unknown>) => {
      const category = pickRelation(item.category as Record<string, unknown> | null);
      return {
        category_code: String(category?.code ?? ""),
        code: String(item.code ?? ""),
        name: String(item.name ?? ""),
        is_active: Boolean(item.is_active),
      };
    });
  }

  if (entity === "products") {
    let query = context.supabase
      .from("products")
      .select(
        "sku, name, barcode, unit, is_active, description, category:product_categories!products_category_id_fkey(code), subcategory:product_subcategories!products_subcategory_id_fkey(code)",
      )
      .order("sku", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return fail(error.message, 400);
    }

    rows = (data ?? []).map((item: Record<string, unknown>) => {
      const category = pickRelation(item.category as Record<string, unknown> | null);
      const subcategory = pickRelation(item.subcategory as Record<string, unknown> | null);

      return {
        sku: String(item.sku ?? ""),
        name: String(item.name ?? ""),
        barcode: item.barcode ? String(item.barcode) : "",
        unit: String(item.unit ?? "unit"),
        is_active: Boolean(item.is_active),
        description: item.description ? String(item.description) : "",
        category_code: String(category?.code ?? ""),
        subcategory_code: String(subcategory?.code ?? ""),
      };
    });
  }

  const csv = toCsv(rows);
  const filename = `${entity}-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
