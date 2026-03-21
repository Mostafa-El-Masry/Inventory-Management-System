import { getAuthContext } from "@/lib/auth/permissions";
import { fail, ok } from "@/lib/utils/http";

type ProductRow = {
  id: string;
};

type RawPurchaseHistoryRow = {
  id: string;
  unit_cost: number | null;
  created_at: string;
};

async function fetchLatestPurchaseLine(
  productId: string,
  requireUnitCost: boolean,
  context: Exclude<Awaited<ReturnType<typeof getAuthContext>>, Response>,
) {
  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return {
      data: null,
      error: null,
    };
  }

  let query = context.supabase
    .from("inventory_transaction_lines")
    .select(
      "id, unit_cost, created_at, inventory_transactions!inner(type, created_at, destination_location_id)",
    )
    .eq("product_id", productId)
    .eq("inventory_transactions.type", "RECEIPT")
    .order("created_at", {
      ascending: false,
      referencedTable: "inventory_transactions",
    })
    .order("created_at", { ascending: false });

  if (context.profile.role !== "admin") {
    query = query.in(
      "inventory_transactions.destination_location_id",
      context.locationIds,
    );
  }

  if (requireUnitCost) {
    query = query.not("unit_cost", "is", null);
  }

  return query.limit(1).maybeSingle<RawPurchaseHistoryRow>();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const { id } = await params;

  const { data: product, error: productError } = await context.supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .maybeSingle<ProductRow>();

  if (productError) {
    return fail(productError.message, 400);
  }

  if (!product) {
    return fail("Product not found.", 404);
  }

  const latestHistoryResult = await fetchLatestPurchaseLine(id, false, context);
  if (latestHistoryResult.error) {
    return fail(latestHistoryResult.error.message, 400);
  }

  if (!latestHistoryResult.data) {
    return ok({
      product_id: id,
      last_unit_cost: null,
      last_unit_cost_at: null,
      has_history: false,
    });
  }

  const latestCostResult = await fetchLatestPurchaseLine(id, true, context);
  if (latestCostResult.error) {
    return fail(latestCostResult.error.message, 400);
  }

  return ok({
    product_id: id,
    last_unit_cost:
      latestCostResult.data?.unit_cost == null
        ? null
        : Number(latestCostResult.data.unit_cost),
    last_unit_cost_at: latestCostResult.data?.created_at ?? null,
    has_history: true,
  });
}
