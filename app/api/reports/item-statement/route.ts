import { assertLocationAccess, getAuthContext } from "@/lib/auth/permissions";
import { buildItemStatement } from "@/lib/reports/item-statement";
import { fail, ok } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  const fromDate = url.searchParams.get("from_date");
  const toDate = url.searchParams.get("to_date");
  const locationId = url.searchParams.get("location_id");

  if (!productId) {
    return fail("product_id is required.", 422);
  }
  if (!fromDate || !toDate) {
    return fail("from_date and to_date are required.", 422);
  }

  const locationError = assertLocationAccess(context, locationId);
  if (locationError) {
    return locationError;
  }

  const { data: product, error: productError } = await context.supabase
    .from("products")
    .select("id, sku, name")
    .eq("id", productId)
    .maybeSingle();
  if (productError) {
    return fail(productError.message, 400);
  }
  if (!product) {
    return fail("Product not found.", 404);
  }

  const result = await buildItemStatement(context, {
    productId,
    fromDate,
    toDate,
    locationId,
  });
  if ("error" in result) {
    return fail(result.error, 422);
  }

  return ok({
    product,
    opening_qty: result.opening_qty,
    rows: result.rows,
  });
}
