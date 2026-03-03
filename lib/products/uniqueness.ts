export type ProductUniquenessConflictType = "name" | "sku";

export type ProductUniquenessConflict = {
  type: ProductUniquenessConflictType;
  product: {
    id: string;
    name: string;
    sku: string;
  };
};

export function normalizeProductName(name: string) {
  return name.trim().toLowerCase();
}

export function normalizeProductSku(sku: string) {
  return sku.trim().toUpperCase();
}

export async function findConflictingProduct(
  supabase: { from: (table: string) => unknown },
  options: {
    name?: string | null;
    sku?: string | null;
    excludeId?: string;
  },
): Promise<{
  conflict: ProductUniquenessConflict | null;
  error: string | null;
}> {
  const normalizedName = options.name ? normalizeProductName(options.name) : null;
  const normalizedSku = options.sku ? normalizeProductSku(options.sku) : null;

  if (!normalizedName && !normalizedSku) {
    return {
      conflict: null,
      error: null,
    };
  }

  type ProductRow = { id: string; name: string; sku: string };
  type ProductListResponse = {
    data: ProductRow[] | null;
    error: { message: string } | null;
  };
  type ProductListQuery = Promise<ProductListResponse> & {
    neq: (column: string, value: string) => Promise<ProductListResponse>;
  };

  const productsTable = supabase.from("products") as {
    select: (columns: string) => ProductListQuery;
  };

  const response = options.excludeId
    ? await productsTable.select("id, name, sku").neq("id", options.excludeId)
    : await productsTable.select("id, name, sku");
  const { data, error } = response;

  if (error) {
    return {
      conflict: null,
      error: error.message,
    };
  }

  for (const product of data ?? []) {
    if (normalizedName && normalizeProductName(product.name) === normalizedName) {
      return {
        conflict: {
          type: "name",
          product,
        },
        error: null,
      };
    }
  }

  for (const product of data ?? []) {
    if (normalizedSku && normalizeProductSku(product.sku) === normalizedSku) {
      return {
        conflict: {
          type: "sku",
          product,
        },
        error: null,
      };
    }
  }

  return {
    conflict: null,
    error: null,
  };
}

export function mapProductUniqueViolation(error: {
  code?: string;
  message?: string;
  details?: string;
}) {
  if (error.code !== "23505") {
    return null;
  }

  const haystack = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (haystack.includes("uq_products_name_norm")) {
    return "Product name already exists.";
  }

  if (haystack.includes("uq_products_sku_norm") || haystack.includes("products_sku_key")) {
    return "Product SKU already exists.";
  }

  if (haystack.includes("products_barcode_key")) {
    return "Product barcode already exists.";
  }

  return null;
}
