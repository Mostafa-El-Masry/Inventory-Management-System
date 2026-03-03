import { mapProductUniqueViolation } from "@/lib/products/uniqueness";

export type ProductCreateInput = {
  name: string;
  barcode: string | null;
  description: string | null;
  unit: string;
  is_active: boolean;
  category_id: string;
  subcategory_id: string;
};

type CreateProductResult =
  | {
      data: Record<string, unknown>;
      error: null;
      status: 201;
    }
  | {
      data: null;
      error: string;
      status: 400 | 409;
    };

type SupabaseProductsTable = {
  insert: (values: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => Promise<{
        data: Record<string, unknown> | null;
        error:
          | {
              code?: string;
              message: string;
              details?: string;
            }
          | null;
      }>;
    };
  };
};

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: string | null;
    error:
      | {
          code?: string;
          message: string;
          details?: string;
        }
      | null;
  }>;
  from: (table: string) => unknown;
};

function mapSkuRpcError(error: { message?: string; details?: string }) {
  const haystack = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (haystack.includes("exhausted")) {
    return {
      status: 409 as const,
      message: "SKU sequence exhausted for this subcategory.",
    };
  }

  if (haystack.includes("invalid category") || haystack.includes("subcategory")) {
    return {
      status: 409 as const,
      message: "Invalid category/subcategory combination.",
    };
  }

  return {
    status: 400 as const,
    message: error.message ?? "Failed to allocate SKU.",
  };
}

export async function createProductWithGeneratedSku(
  supabase: SupabaseRpcClient,
  input: ProductCreateInput,
) {
  const maxAttempts = 5;
  const client = supabase as SupabaseRpcClient;
  const productsTable = client.from("products") as SupabaseProductsTable;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: sku, error: skuError } = await client.rpc("rpc_next_product_sku", {
      p_category_id: input.category_id,
      p_subcategory_id: input.subcategory_id,
    });

    if (skuError || !sku) {
      const mapped = mapSkuRpcError(skuError ?? { message: "Failed to allocate SKU." });
      return {
        data: null,
        error: mapped.message,
        status: mapped.status,
      } satisfies CreateProductResult;
    }

    const { data, error } = await productsTable
      .insert({
        sku,
        name: input.name,
        barcode: input.barcode,
        description: input.description,
        unit: input.unit,
        is_active: input.is_active,
        category_id: input.category_id,
        subcategory_id: input.subcategory_id,
      })
      .select("*")
      .single();

    if (!error && data) {
      return {
        data,
        error: null,
        status: 201,
      } satisfies CreateProductResult;
    }

    if (error?.code === "23505") {
      const mapped = mapProductUniqueViolation(error);
      if (mapped) {
        return {
          data: null,
          error: mapped,
          status: 409,
        } satisfies CreateProductResult;
      }
      continue;
    }

    return {
      data: null,
      error: error?.message ?? "Failed to create product.",
      status: 400,
    } satisfies CreateProductResult;
  }

  return {
    data: null,
    error: "Failed to generate a unique product SKU.",
    status: 409,
  } satisfies CreateProductResult;
}
