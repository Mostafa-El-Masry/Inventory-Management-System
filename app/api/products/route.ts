import {
  assertMasterPermission,
  assertRole,
  getAuthContext,
  hasMasterPermission,
} from "@/lib/auth/permissions";
import { createProductWithGeneratedSku } from "@/lib/products/create";
import {
  findConflictingProduct,
  mapProductUniqueViolation,
} from "@/lib/products/uniqueness";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productCreateSchema, productPatchSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

const PRODUCT_LINK_LOOKUP_BATCH_SIZE = 200;
const PRODUCT_LIST_BATCH_SIZE = 500;
const PRODUCT_LIST_MAX_PAGE_SIZE = 250;
const PRODUCT_SORT_KEYS = [
  "name",
  "barcode",
  "sku",
  "category",
  "subcategory",
  "unit",
  "active",
] as const;
const PRODUCT_SORT_DIRECTIONS = ["asc", "desc"] as const;
const PRODUCT_SELECT_COLUMNS = `
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
`;

type ProductLinkLookupClient = Pick<typeof supabaseAdmin, "from">;
type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];
type ProductSortDirection = (typeof PRODUCT_SORT_DIRECTIONS)[number];
type ProductReadClient = Pick<typeof supabaseAdmin, "from">;
type RawProductItem = Record<string, unknown>;
type ProductListPagination = {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number | null;
};
type ProductListRequest = {
  includeInactive: boolean;
  page: number | null;
  limit: number | null;
  sortKey: ProductSortKey;
  sortDirection: ProductSortDirection;
};

function pickRelation<T extends Record<string, unknown>>(
  value: T | T[] | null | undefined,
) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function loadLinkedProductIds(
  client: ProductLinkLookupClient,
  productIds: string[],
) {
  const linkedProductIds = new Set<string>();

  for (
    let startIndex = 0;
    startIndex < productIds.length;
    startIndex += PRODUCT_LINK_LOOKUP_BATCH_SIZE
  ) {
    const productIdBatch = productIds.slice(
      startIndex,
      startIndex + PRODUCT_LINK_LOOKUP_BATCH_SIZE,
    );
    const { data, error } = await client
      .from("inventory_transaction_lines")
      .select("product_id")
      .in("product_id", productIdBatch);

    if (error) {
      return {
        linkedProductIds: null,
        error,
      };
    }

    (data ?? []).forEach((row: { product_id: string }) => {
      linkedProductIds.add(row.product_id);
    });
  }

  return {
    linkedProductIds,
    error: null,
  };
}

function parsePositiveInteger(raw: string | null, label: string) {
  if (raw === null) {
    return {
      value: null,
      error: null,
    };
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    return {
      value: null,
      error: fail(`${label} must be a positive integer.`, 422),
    };
  }

  return {
    value,
    error: null,
  };
}

function parseProductListRequest(url: URL) {
  const includeInactive = url.searchParams.get("include_inactive") === "true";
  const pageParam = parsePositiveInteger(url.searchParams.get("page"), "Page");
  if (pageParam.error) {
    return {
      data: null,
      error: pageParam.error,
    };
  }

  const limitParam = parsePositiveInteger(url.searchParams.get("limit"), "Limit");
  if (limitParam.error) {
    return {
      data: null,
      error: limitParam.error,
    };
  }

  const rawSortKey = url.searchParams.get("sort");
  const sortKey = PRODUCT_SORT_KEYS.includes(rawSortKey as ProductSortKey)
    ? (rawSortKey as ProductSortKey)
    : "name";
  if (rawSortKey !== null && !PRODUCT_SORT_KEYS.includes(rawSortKey as ProductSortKey)) {
    return {
      data: null,
      error: fail(
        `Invalid product sort key. Use one of: ${PRODUCT_SORT_KEYS.join(", ")}.`,
        422,
      ),
    };
  }

  const rawSortDirection = url.searchParams.get("direction");
  const sortDirection = PRODUCT_SORT_DIRECTIONS.includes(rawSortDirection as ProductSortDirection)
    ? (rawSortDirection as ProductSortDirection)
    : "asc";
  if (
    rawSortDirection !== null &&
    !PRODUCT_SORT_DIRECTIONS.includes(rawSortDirection as ProductSortDirection)
  ) {
    return {
      data: null,
      error: fail("Invalid product sort direction. Use asc or desc.", 422),
    };
  }

  const hasPaginationParams =
    url.searchParams.has("page") || url.searchParams.has("limit");
  const page = hasPaginationParams ? (pageParam.value ?? 1) : null;
  const limit = hasPaginationParams ? (limitParam.value ?? 10) : null;

  if (limit !== null && limit > PRODUCT_LIST_MAX_PAGE_SIZE) {
    return {
      data: null,
      error: fail(
        `Product page size cannot exceed ${PRODUCT_LIST_MAX_PAGE_SIZE}.`,
        422,
      ),
    };
  }

  return {
    data: {
      includeInactive,
      page,
      limit,
      sortKey,
      sortDirection,
    } satisfies ProductListRequest,
    error: null,
  };
}

function buildProductsQuery(
  client: ProductReadClient,
  request: ProductListRequest,
  includeCount = false,
) {
  let query = includeCount
    ? client.from("products").select(PRODUCT_SELECT_COLUMNS, { count: "exact" })
    : client.from("products").select(PRODUCT_SELECT_COLUMNS);
  const ascending = request.sortDirection === "asc";

  if (!request.includeInactive) {
    query = query.eq("is_active", true);
  }

  switch (request.sortKey) {
    case "barcode":
      query = query
        .order("barcode", { ascending, nullsFirst: ascending })
        .order("name", { ascending: true });
      break;
    case "sku":
      query = query.order("sku", { ascending });
      break;
    case "category":
      query = query
        .order("name", { ascending, referencedTable: "category" })
        .order("code", { ascending, referencedTable: "category" })
        .order("name", { ascending: true });
      break;
    case "subcategory":
      query = query
        .order("name", { ascending, referencedTable: "subcategory" })
        .order("code", { ascending, referencedTable: "subcategory" })
        .order("name", { ascending: true });
      break;
    case "unit":
      query = query
        .order("unit", { ascending })
        .order("name", { ascending: true });
      break;
    case "active":
      query = query
        .order("is_active", { ascending })
        .order("name", { ascending: true });
      break;
    case "name":
    default:
      query = query
        .order("name", { ascending })
        .order("sku", { ascending: true });
      break;
  }

  return query;
}

function normalizeProductItems(data: RawProductItem[]) {
  return data.map((item) => {
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
  });
}

async function fetchAllProducts(
  client: ProductReadClient,
  request: ProductListRequest,
) {
  const items: RawProductItem[] = [];

  for (
    let startIndex = 0;
    ;
    startIndex += PRODUCT_LIST_BATCH_SIZE
  ) {
    const endIndex = startIndex + PRODUCT_LIST_BATCH_SIZE - 1;
    const { data, error } = await buildProductsQuery(client, request).range(
      startIndex,
      endIndex,
    );

    if (error) {
      return {
        items: null,
        pagination: null,
        error,
      };
    }

    const batchItems = (data ?? []) as RawProductItem[];
    items.push(...batchItems);

    if (batchItems.length < PRODUCT_LIST_BATCH_SIZE) {
      break;
    }
  }

  return {
    items: normalizeProductItems(items),
    pagination: {
      totalItems: items.length,
      totalPages: 1,
      currentPage: 1,
      pageSize: null,
    } satisfies ProductListPagination,
    error: null,
  };
}

async function fetchProductPage(
  client: ProductReadClient,
  request: ProductListRequest & {
    page: number;
    limit: number;
  },
) {
  const rangeStart = (request.page - 1) * request.limit;
  const rangeEnd = rangeStart + request.limit - 1;
  const { data, error, count } = await buildProductsQuery(client, request, true).range(
    rangeStart,
    rangeEnd,
  );

  if (error) {
    return {
      items: null,
      pagination: null,
      error,
    };
  }

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / request.limit));
  const currentPage = Math.min(request.page, totalPages);

  if (totalItems > 0 && currentPage !== request.page) {
    return fetchProductPage(client, {
      ...request,
      page: currentPage,
    });
  }

  return {
    items: normalizeProductItems((data ?? []) as RawProductItem[]),
    pagination: {
      totalItems,
      totalPages,
      currentPage,
      pageSize: request.limit,
    } satisfies ProductListPagination,
    error: null,
  };
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const parsedRequest = parseProductListRequest(new URL(request.url));
  if (parsedRequest.error) {
    return parsedRequest.error;
  }

  const requestOptions = parsedRequest.data;
  const productListResult =
    requestOptions.page !== null && requestOptions.limit !== null
      ? await fetchProductPage(context.supabase, {
          ...requestOptions,
          page: requestOptions.page,
          limit: requestOptions.limit,
        })
      : await fetchAllProducts(context.supabase, requestOptions);

  if (productListResult.error) {
    return fail(productListResult.error.message, 400);
  }

  const items = productListResult.items;
  const pagination = productListResult.pagination;

  if (!hasMasterPermission(context, "products", "delete") || items.length === 0) {
    return ok({ items, pagination });
  }
  const metadataClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const productIds = items.map((item) => String(item.id));
  const linkedLookup = await loadLinkedProductIds(metadataClient, productIds);
  if (linkedLookup.error) {
    return fail(linkedLookup.error.message, 400);
  }

  const linkedProductIds = linkedLookup.linkedProductIds;

  return ok({
    items: items.map((item) => ({
      ...item,
      can_hard_delete: !linkedProductIds.has(String(item.id)),
    })),
    pagination,
  });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const permissionError = assertMasterPermission(context, "products", "create");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, productCreateSchema);
  if ("error" in payload) {
    return payload.error;
  }

  const { name, barcode, description, unit, is_active, category_id, subcategory_id } =
    payload.data;
  const normalizedName = name.trim();
  const normalizedUnit = unit.trim();

  const nameConflict = await findConflictingProduct(writeClient, {
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

  const created = await createProductWithGeneratedSku(writeClient, {
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
