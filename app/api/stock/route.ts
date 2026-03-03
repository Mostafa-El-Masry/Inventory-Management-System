import { getAuthContext } from "@/lib/auth/permissions";
import {
  buildBatchStockAsOfDate,
  parseAsOfDate,
} from "@/lib/stock/snapshot";
import type { BatchMetadataRow, LedgerMovementRow } from "@/lib/stock/snapshot";
import { fail, ok } from "@/lib/utils/http";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  const locationId = url.searchParams.get("location_id");
  const asOfDate = url.searchParams.get("as_of_date");

  const parsedAsOfDate = parseAsOfDate(asOfDate);
  if (parsedAsOfDate.error) {
    return fail(parsedAsOfDate.error, 422);
  }

  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return ok({ items: [] });
  }

  if (parsedAsOfDate.cutoffExclusiveIso) {
    let ledgerQuery = context.supabase
      .from("stock_ledger")
      .select("batch_id, product_id, location_id, direction, qty")
      .lt("occurred_at", parsedAsOfDate.cutoffExclusiveIso);

    if (productId) {
      ledgerQuery = ledgerQuery.eq("product_id", productId);
    }

    if (locationId) {
      ledgerQuery = ledgerQuery.eq("location_id", locationId);
    }

    if (context.profile.role !== "admin") {
      ledgerQuery = ledgerQuery.in("location_id", context.locationIds);
    }

    const { data: ledgerData, error: ledgerError } = await ledgerQuery;
    if (ledgerError) {
      return fail(ledgerError.message, 400);
    }

    const ledgerRows = (ledgerData ?? []) as LedgerMovementRow[];
    if (ledgerRows.length === 0) {
      return ok({ items: [] });
    }

    const batchIds = Array.from(new Set(ledgerRows.map((row) => row.batch_id)));
    let batchQuery = context.supabase
      .from("inventory_batches")
      .select(
        "id, product_id, location_id, lot_number, expiry_date, received_at, unit_cost, products(name, sku), locations(name, code)",
      )
      .in("id", batchIds);

    if (productId) {
      batchQuery = batchQuery.eq("product_id", productId);
    }

    if (locationId) {
      batchQuery = batchQuery.eq("location_id", locationId);
    }

    if (context.profile.role !== "admin") {
      batchQuery = batchQuery.in("location_id", context.locationIds);
    }

    const { data: batchData, error: batchError } = await batchQuery;
    if (batchError) {
      return fail(batchError.message, 400);
    }

    const items = buildBatchStockAsOfDate(
      ledgerRows,
      (batchData ?? []) as BatchMetadataRow[],
    );
    return ok({ items });
  }

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
