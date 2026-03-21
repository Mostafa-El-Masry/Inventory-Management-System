import { getAuthContext } from "@/lib/auth/permissions";
import {
  PURCHASE_DRAFT_MATCH_LIMIT,
  PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH,
  type PurchaseLookupProduct,
} from "@/lib/transactions/purchase-invoice-draft";
import { fail, ok } from "@/lib/utils/http";

const PRODUCT_LOOKUP_MAX_LIMIT = 20;

type ProductLookupField = "item" | "sku";

function normalizeSearchInput(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function parsePositiveLimit(value: string | null) {
  if (value == null || value.trim() === "") {
    return {
      data: PURCHASE_DRAFT_MATCH_LIMIT,
      error: null,
    } as const;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return {
      data: null,
      error: fail("Limit must be a positive integer.", 422),
    } as const;
  }

  return {
    data: Math.min(parsed, PRODUCT_LOOKUP_MAX_LIMIT),
    error: null,
  } as const;
}

function parseLookupField(value: string | null) {
  if (value === "item" || value === "sku") {
    return {
      data: value,
      error: null,
    } as const;
  }

  return {
    data: null,
    error: fail("Field must be either 'item' or 'sku'.", 422),
  } as const;
}

function normalizeLookupItems(items: PurchaseLookupProduct[]) {
  return items.map((item) => ({
    id: String(item.id),
    name: item.name ?? "",
    sku: item.sku ?? null,
    barcode: item.barcode ?? null,
  }));
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const query = normalizeSearchInput(url.searchParams.get("q"));
  if (query.length < PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH) {
    return fail(
      `Query must be at least ${PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH} characters.`,
      422,
    );
  }

  const parsedField = parseLookupField(url.searchParams.get("field"));
  if (parsedField.error) {
    return parsedField.error;
  }

  const parsedLimit = parsePositiveLimit(url.searchParams.get("limit"));
  if (parsedLimit.error) {
    return parsedLimit.error;
  }

  const pattern = `${query}%`;
  const field = parsedField.data as ProductLookupField;
  let lookupQuery = context.supabase
    .from("products")
    .select("id, name, sku, barcode")
    .eq("is_active", true);

  if (field === "item") {
    lookupQuery = lookupQuery
      .ilike("name", pattern)
      .order("name", { ascending: true })
      .order("sku", { ascending: true, nullsFirst: false });
  } else {
    lookupQuery = lookupQuery
      .or(`sku.ilike.${pattern},barcode.ilike.${pattern}`)
      .order("sku", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
  }

  const { data, error } = await lookupQuery.limit(parsedLimit.data);
  if (error) {
    return fail(error.message, 400);
  }

  return ok({
    items: normalizeLookupItems((data ?? []) as PurchaseLookupProduct[]),
  });
}
