import type { AuthContext } from "@/lib/auth/permissions";

export type CostEvolutionRow = {
  occurred_at: string;
  tx_number: string | null;
  transaction_type: string | null;
  location_id: string;
  location_code: string;
  location_name: string;
  qty_in: number;
  unit_cost: number;
  line_value: number;
  cost_source: "line_unit_cost" | "batch_unit_cost" | "fallback_zero";
  lot_number: string | null;
  expiry_date: string | null;
};

export type ItemCostEvolutionResult = {
  rows: CostEvolutionRow[];
  summary: {
    min_unit_cost: number;
    max_unit_cost: number;
    avg_unit_cost: number;
    total_qty_in: number;
    total_value: number;
  };
};

type LedgerRow = {
  transaction_line_id: string;
  batch_id: string;
  location_id: string;
  qty: number;
  occurred_at: string;
};

type TransactionLineRow = {
  id: string;
  transaction_id: string;
  unit_cost: number | null;
};

type TransactionRow = {
  id: string;
  tx_number: string;
  type: string;
};

type BatchRow = {
  id: string;
  unit_cost: number | null;
  lot_number: string | null;
  expiry_date: string | null;
};

type LocationRow = {
  id: string;
  code: string;
  name: string;
};

function parseDateOrNull(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

function toStartIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toExclusiveEndIso(value: string) {
  const start = parseDateOrNull(value);
  if (!start) {
    return null;
  }
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export async function buildItemCostEvolution(
  context: AuthContext,
  params: {
    productId: string;
    fromDate: string;
    toDate: string;
    locationId: string | null;
  },
): Promise<{ error: string } | ItemCostEvolutionResult> {
  const fromDate = parseDateOrNull(params.fromDate);
  const toDate = parseDateOrNull(params.toDate);
  if (!fromDate || !toDate) {
    return { error: "Invalid date range. Use YYYY-MM-DD." };
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return { error: "Invalid date range. from_date must be before or equal to to_date." };
  }

  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return {
      rows: [],
      summary: {
        min_unit_cost: 0,
        max_unit_cost: 0,
        avg_unit_cost: 0,
        total_qty_in: 0,
        total_value: 0,
      },
    };
  }

  const fromStartIso = toStartIso(params.fromDate);
  const toExclusiveIso = toExclusiveEndIso(params.toDate);
  if (!toExclusiveIso) {
    return { error: "Invalid to_date." };
  }

  let query = context.supabase
    .from("stock_ledger")
    .select("transaction_line_id, batch_id, location_id, qty, occurred_at")
    .eq("product_id", params.productId)
    .eq("direction", "IN")
    .gte("occurred_at", fromStartIso)
    .lt("occurred_at", toExclusiveIso)
    .order("occurred_at", { ascending: true });

  if (params.locationId) {
    query = query.eq("location_id", params.locationId);
  }

  if (context.profile.role !== "admin") {
    query = query.in("location_id", context.locationIds);
  }

  const { data: movementData, error: movementError } = await query;
  if (movementError) {
    return { error: movementError.message };
  }

  const movements = (movementData ?? []) as LedgerRow[];
  if (movements.length === 0) {
    return {
      rows: [],
      summary: {
        min_unit_cost: 0,
        max_unit_cost: 0,
        avg_unit_cost: 0,
        total_qty_in: 0,
        total_value: 0,
      },
    };
  }

  const lineIds = Array.from(new Set(movements.map((row) => row.transaction_line_id)));
  const batchIds = Array.from(new Set(movements.map((row) => row.batch_id)));
  const locationIds = Array.from(new Set(movements.map((row) => row.location_id)));

  const { data: lineData, error: lineError } = await context.supabase
    .from("inventory_transaction_lines")
    .select("id, transaction_id, unit_cost")
    .in("id", lineIds);
  if (lineError) {
    return { error: lineError.message };
  }

  const lines = (lineData ?? []) as TransactionLineRow[];
  const txIds = Array.from(new Set(lines.map((row) => row.transaction_id)));
  const { data: txData, error: txError } = await context.supabase
    .from("inventory_transactions")
    .select("id, tx_number, type")
    .in("id", txIds);
  if (txError) {
    return { error: txError.message };
  }

  const { data: batchData, error: batchError } = await context.supabase
    .from("inventory_batches")
    .select("id, unit_cost, lot_number, expiry_date")
    .in("id", batchIds);
  if (batchError) {
    return { error: batchError.message };
  }

  const { data: locationData, error: locationError } = await context.supabase
    .from("locations")
    .select("id, code, name")
    .in("id", locationIds);
  if (locationError) {
    return { error: locationError.message };
  }

  const lineById = new Map(lines.map((line) => [line.id, line]));
  const txById = new Map(((txData ?? []) as TransactionRow[]).map((tx) => [tx.id, tx]));
  const batchById = new Map(((batchData ?? []) as BatchRow[]).map((batch) => [batch.id, batch]));
  const locationById = new Map(
    ((locationData ?? []) as LocationRow[]).map((location) => [location.id, location]),
  );

  const rows: CostEvolutionRow[] = [];

  for (const movement of movements) {
    const qty = Number(movement.qty ?? 0);
    const line = lineById.get(movement.transaction_line_id);
    const tx = line ? txById.get(line.transaction_id) : undefined;
    const batch = batchById.get(movement.batch_id);
    const location = locationById.get(movement.location_id);

    const lineCost = line?.unit_cost;
    const batchCost = batch?.unit_cost;
    const unitCost =
      lineCost !== null && lineCost !== undefined
        ? Number(lineCost)
        : batchCost !== null && batchCost !== undefined
          ? Number(batchCost)
          : 0;
    const costSource =
      lineCost !== null && lineCost !== undefined
        ? "line_unit_cost"
        : batchCost !== null && batchCost !== undefined
          ? "batch_unit_cost"
          : "fallback_zero";

    rows.push({
      occurred_at: movement.occurred_at,
      tx_number: tx?.tx_number ?? null,
      transaction_type: tx?.type ?? null,
      location_id: movement.location_id,
      location_code: location?.code ?? movement.location_id,
      location_name: location?.name ?? movement.location_id,
      qty_in: qty,
      unit_cost: Number.isFinite(unitCost) ? unitCost : 0,
      line_value: qty * (Number.isFinite(unitCost) ? unitCost : 0),
      cost_source: costSource,
      lot_number: batch?.lot_number ?? null,
      expiry_date: batch?.expiry_date ?? null,
    });
  }

  let minUnitCost = Number.POSITIVE_INFINITY;
  let maxUnitCost = Number.NEGATIVE_INFINITY;
  let unitCostSum = 0;
  let totalQtyIn = 0;
  let totalValue = 0;

  for (const row of rows) {
    minUnitCost = Math.min(minUnitCost, row.unit_cost);
    maxUnitCost = Math.max(maxUnitCost, row.unit_cost);
    unitCostSum += row.unit_cost;
    totalQtyIn += row.qty_in;
    totalValue += row.line_value;
  }

  return {
    rows,
    summary: {
      min_unit_cost: rows.length > 0 ? minUnitCost : 0,
      max_unit_cost: rows.length > 0 ? maxUnitCost : 0,
      avg_unit_cost: rows.length > 0 ? unitCostSum / rows.length : 0,
      total_qty_in: totalQtyIn,
      total_value: totalValue,
    },
  };
}
