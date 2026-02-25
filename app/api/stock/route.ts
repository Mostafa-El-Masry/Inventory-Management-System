import { getAuthContext } from "@/lib/auth/permissions";
import { fail, ok } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  const locationId = url.searchParams.get("location_id");

  let query = context.supabase
    .from("inventory_batches")
    .select(
      "id, product_id, location_id, lot_number, expiry_date, received_at, qty_on_hand, unit_cost, products(name, sku), locations(name, code)",
    )
    .gt("qty_on_hand", 0);

  if (productId) {
    query = query.eq("product_id", productId);
  }

  if (locationId) {
    query = query.eq("location_id", locationId);
  }

  if (context.profile.role !== "admin") {
    if (context.locationIds.length === 0) {
      return ok({ items: [] });
    }
    query = query.in("location_id", context.locationIds);
  }

  const { data, error } = await query
    .order("expiry_date", { ascending: true })
    .order("received_at", { ascending: true });

  if (error) {
    return fail(error.message, 400);
  }

  return ok({ items: data ?? [] });
}
