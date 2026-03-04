import type { AuthContext } from "@/lib/auth/permissions";
import {
  buildBatchStockAsOfDate,
  parseAsOfDate,
  type BatchMetadataRow,
  type LedgerMovementRow,
} from "@/lib/stock/snapshot";

type StockLookup = {
  name: string;
  code?: string;
  sku?: string;
};

type BatchWithQty = {
  product_id: string;
  location_id: string;
  qty_on_hand: number;
  unit_cost: number | null;
  products?: StockLookup | StockLookup[] | null;
  locations?: StockLookup | StockLookup[] | null;
};

export type StockSummaryDetailRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  qty_on_hand: number;
  stock_value: number;
};

export type StockSummaryTotalRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  qty_on_hand: number;
  stock_value: number;
};

export type StockSummaryResult = {
  details: StockSummaryDetailRow[];
  totals: StockSummaryTotalRow[];
};

function normalizeLookup(value: StockLookup | StockLookup[] | null | undefined) {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateStockRows(rows: BatchWithQty[]): StockSummaryResult {
  const detailsMap = new Map<string, StockSummaryDetailRow>();
  const totalsMap = new Map<string, StockSummaryTotalRow>();

  for (const row of rows) {
    const product = normalizeLookup(row.products);
    const location = normalizeLookup(row.locations);
    const qty = toNumber(row.qty_on_hand);
    if (qty <= 0) {
      continue;
    }
    const unitCost = toNumber(row.unit_cost);
    const value = qty * unitCost;

    const detailKey = `${row.location_id}:${row.product_id}`;
    const existingDetail = detailsMap.get(detailKey);
    if (existingDetail) {
      existingDetail.qty_on_hand += qty;
      existingDetail.stock_value += value;
    } else {
      detailsMap.set(detailKey, {
        location_id: row.location_id,
        location_code: location?.code ?? row.location_id,
        location_name: location?.name ?? row.location_id,
        product_id: row.product_id,
        sku: product?.sku ?? row.product_id,
        product_name: product?.name ?? row.product_id,
        qty_on_hand: qty,
        stock_value: value,
      });
    }

    const totalKey = row.location_id;
    const existingTotal = totalsMap.get(totalKey);
    if (existingTotal) {
      existingTotal.qty_on_hand += qty;
      existingTotal.stock_value += value;
    } else {
      totalsMap.set(totalKey, {
        location_id: row.location_id,
        location_code: location?.code ?? row.location_id,
        location_name: location?.name ?? row.location_id,
        qty_on_hand: qty,
        stock_value: value,
      });
    }
  }

  const details = Array.from(detailsMap.values()).sort((left, right) => {
    const locationCompare = left.location_name.localeCompare(right.location_name);
    if (locationCompare !== 0) {
      return locationCompare;
    }
    return left.product_name.localeCompare(right.product_name);
  });
  const totals = Array.from(totalsMap.values()).sort((left, right) =>
    left.location_name.localeCompare(right.location_name),
  );

  return { details, totals };
}

export async function buildStockSummary(
  context: AuthContext,
  params: { asOfDate: string | null; locationId: string | null },
): Promise<{ error: string } | StockSummaryResult> {
  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return { details: [], totals: [] };
  }

  const parsedDate = parseAsOfDate(params.asOfDate);
  if (parsedDate.error) {
    return { error: parsedDate.error };
  }

  if (parsedDate.cutoffExclusiveIso) {
    let ledgerQuery = context.supabase
      .from("stock_ledger")
      .select("batch_id, product_id, location_id, direction, qty")
      .lt("occurred_at", parsedDate.cutoffExclusiveIso);

    if (params.locationId) {
      ledgerQuery = ledgerQuery.eq("location_id", params.locationId);
    }

    if (context.profile.role !== "admin") {
      ledgerQuery = ledgerQuery.in("location_id", context.locationIds);
    }

    const { data: ledgerData, error: ledgerError } = await ledgerQuery;
    if (ledgerError) {
      return { error: ledgerError.message };
    }

    const ledgerRows = (ledgerData ?? []) as LedgerMovementRow[];
    if (ledgerRows.length === 0) {
      return { details: [], totals: [] };
    }

    const batchIds = Array.from(new Set(ledgerRows.map((row) => row.batch_id)));
    let batchQuery = context.supabase
      .from("inventory_batches")
      .select(
        "id, product_id, location_id, lot_number, expiry_date, received_at, unit_cost, products(name, sku), locations(name, code)",
      )
      .in("id", batchIds);

    if (params.locationId) {
      batchQuery = batchQuery.eq("location_id", params.locationId);
    }

    if (context.profile.role !== "admin") {
      batchQuery = batchQuery.in("location_id", context.locationIds);
    }

    const { data: batchData, error: batchError } = await batchQuery;
    if (batchError) {
      return { error: batchError.message };
    }

    const snapshotRows = buildBatchStockAsOfDate(
      ledgerRows,
      (batchData ?? []) as BatchMetadataRow[],
    );

    return aggregateStockRows(snapshotRows);
  }

  let query = context.supabase
    .from("inventory_batches")
    .select("product_id, location_id, qty_on_hand, unit_cost, products(name, sku), locations(name, code)")
    .gt("qty_on_hand", 0);

  if (params.locationId) {
    query = query.eq("location_id", params.locationId);
  }

  if (context.profile.role !== "admin") {
    query = query.in("location_id", context.locationIds);
  }

  const { data, error } = await query;
  if (error) {
    return { error: error.message };
  }

  return aggregateStockRows((data ?? []) as BatchWithQty[]);
}
