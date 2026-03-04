import type { AuthContext } from "@/lib/auth/permissions";

export type ItemStatementRow = {
  occurred_at: string;
  tx_number: string | null;
  transaction_type: string | null;
  transaction_status: string | null;
  location_id: string;
  location_code: string;
  location_name: string;
  direction: "IN" | "OUT";
  qty: number;
  signed_qty: number;
  running_qty: number;
  unit_cost: number;
  reason_code: string | null;
};

export type ItemStatementResult = {
  opening_qty: number;
  rows: ItemStatementRow[];
};

type LedgerRow = {
  transaction_line_id: string;
  location_id: string;
  direction: string;
  qty: number;
  occurred_at: string;
};

type TransactionLineRow = {
  id: string;
  transaction_id: string;
  unit_cost: number | null;
  reason_code: string | null;
};

type TransactionRow = {
  id: string;
  tx_number: string;
  type: string;
  status: string;
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

function toSignedQty(direction: string, qty: number) {
  return direction.toUpperCase() === "IN" ? qty : -qty;
}

export async function buildItemStatement(
  context: AuthContext,
  params: {
    productId: string;
    fromDate: string;
    toDate: string;
    locationId: string | null;
  },
): Promise<{ error: string } | ItemStatementResult> {
  const fromDate = parseDateOrNull(params.fromDate);
  const toDate = parseDateOrNull(params.toDate);
  if (!fromDate || !toDate) {
    return { error: "Invalid date range. Use YYYY-MM-DD." };
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return { error: "Invalid date range. from_date must be before or equal to to_date." };
  }

  if (context.profile.role !== "admin" && context.locationIds.length === 0) {
    return { opening_qty: 0, rows: [] };
  }

  const fromStartIso = toStartIso(params.fromDate);
  const toExclusiveIso = toExclusiveEndIso(params.toDate);
  if (!toExclusiveIso) {
    return { error: "Invalid to_date." };
  }

  let openingQuery = context.supabase
    .from("stock_ledger")
    .select("direction, qty")
    .eq("product_id", params.productId)
    .lt("occurred_at", fromStartIso);

  if (params.locationId) {
    openingQuery = openingQuery.eq("location_id", params.locationId);
  }

  if (context.profile.role !== "admin") {
    openingQuery = openingQuery.in("location_id", context.locationIds);
  }

  const { data: openingData, error: openingError } = await openingQuery;
  if (openingError) {
    return { error: openingError.message };
  }

  const openingQty = (openingData ?? []).reduce((total, row) => {
    const qty = Number((row as { qty?: unknown }).qty ?? 0);
    const direction = String((row as { direction?: unknown }).direction ?? "");
    return total + toSignedQty(direction, qty);
  }, 0);

  let movementQuery = context.supabase
    .from("stock_ledger")
    .select("transaction_line_id, location_id, direction, qty, occurred_at")
    .eq("product_id", params.productId)
    .gte("occurred_at", fromStartIso)
    .lt("occurred_at", toExclusiveIso)
    .order("occurred_at", { ascending: true });

  if (params.locationId) {
    movementQuery = movementQuery.eq("location_id", params.locationId);
  }

  if (context.profile.role !== "admin") {
    movementQuery = movementQuery.in("location_id", context.locationIds);
  }

  const { data: movementData, error: movementError } = await movementQuery;
  if (movementError) {
    return { error: movementError.message };
  }

  const movements = (movementData ?? []) as LedgerRow[];
  if (movements.length === 0) {
    return { opening_qty: openingQty, rows: [] };
  }

  const lineIds = Array.from(new Set(movements.map((row) => row.transaction_line_id)));
  const { data: lineData, error: lineError } = await context.supabase
    .from("inventory_transaction_lines")
    .select("id, transaction_id, unit_cost, reason_code")
    .in("id", lineIds);
  if (lineError) {
    return { error: lineError.message };
  }

  const lines = (lineData ?? []) as TransactionLineRow[];
  const txIds = Array.from(new Set(lines.map((row) => row.transaction_id)));
  const { data: txData, error: txError } = await context.supabase
    .from("inventory_transactions")
    .select("id, tx_number, type, status")
    .in("id", txIds);
  if (txError) {
    return { error: txError.message };
  }

  const locationIds = Array.from(new Set(movements.map((row) => row.location_id)));
  const { data: locationData, error: locationError } = await context.supabase
    .from("locations")
    .select("id, code, name")
    .in("id", locationIds);
  if (locationError) {
    return { error: locationError.message };
  }

  const lineById = new Map(lines.map((line) => [line.id, line]));
  const txById = new Map(((txData ?? []) as TransactionRow[]).map((tx) => [tx.id, tx]));
  const locationById = new Map(
    ((locationData ?? []) as LocationRow[]).map((location) => [location.id, location]),
  );

  let runningQty = openingQty;
  const rows: ItemStatementRow[] = [];

  for (const movement of movements) {
    const qty = Number(movement.qty ?? 0);
    const directionUpper = movement.direction.toUpperCase();
    const direction = directionUpper === "IN" ? "IN" : "OUT";
    const signedQty = toSignedQty(directionUpper, qty);
    runningQty += signedQty;

    const line = lineById.get(movement.transaction_line_id);
    const tx = line ? txById.get(line.transaction_id) : undefined;
    const location = locationById.get(movement.location_id);

    rows.push({
      occurred_at: movement.occurred_at,
      tx_number: tx?.tx_number ?? null,
      transaction_type: tx?.type ?? null,
      transaction_status: tx?.status ?? null,
      location_id: movement.location_id,
      location_code: location?.code ?? movement.location_id,
      location_name: location?.name ?? movement.location_id,
      direction,
      qty,
      signed_qty: signedQty,
      running_qty: runningQty,
      unit_cost: Number(line?.unit_cost ?? 0),
      reason_code: line?.reason_code ?? null,
    });
  }

  return { opening_qty: openingQty, rows };
}
