const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type StockLookup = {
  name: string;
  code?: string;
  sku?: string;
};

export type BatchMetadataRow = {
  id: string;
  product_id: string;
  location_id: string;
  lot_number: string | null;
  expiry_date: string | null;
  received_at: string;
  unit_cost: number | null;
  products?: StockLookup | StockLookup[] | null;
  locations?: StockLookup | StockLookup[] | null;
};

export type LedgerMovementRow = {
  batch_id: string;
  product_id: string;
  location_id: string;
  direction: string;
  qty: number;
};

export type StockBatchSnapshotRow = Omit<BatchMetadataRow, "products" | "locations"> & {
  products?: StockLookup | null;
  locations?: StockLookup | null;
  qty_on_hand: number;
};

export type StockExportSnapshotRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  qty_on_hand: number;
  nearest_expiry_date: string | null;
};

function sortBatchRows(rows: StockBatchSnapshotRow[]) {
  return rows.sort((left, right) => {
    const expiryCompare = (left.expiry_date ?? "9999-12-31").localeCompare(
      right.expiry_date ?? "9999-12-31",
    );
    if (expiryCompare !== 0) {
      return expiryCompare;
    }

    const receivedCompare = left.received_at.localeCompare(right.received_at);
    if (receivedCompare !== 0) {
      return receivedCompare;
    }

    return left.id.localeCompare(right.id);
  });
}

function normalizeLookup(value: StockLookup | StockLookup[] | null | undefined) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export function parseAsOfDate(asOfDate: string | null) {
  if (!asOfDate || asOfDate.trim() === "") {
    return {
      cutoffExclusiveIso: null,
      error: null,
    } as const;
  }

  const trimmed = asOfDate.trim();
  if (!DATE_PATTERN.test(trimmed)) {
    return {
      cutoffExclusiveIso: null,
      error: "Invalid as_of_date. Use YYYY-MM-DD (for example 2025-12-31).",
    } as const;
  }

  const midnightUtc = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(midnightUtc.getTime()) || midnightUtc.toISOString().slice(0, 10) !== trimmed) {
    return {
      cutoffExclusiveIso: null,
      error: "Invalid as_of_date. Use YYYY-MM-DD (for example 2025-12-31).",
    } as const;
  }

  return {
    cutoffExclusiveIso: new Date(midnightUtc.getTime() + DAY_IN_MS).toISOString(),
    error: null,
  } as const;
}

export function buildBatchStockAsOfDate(
  ledgerRows: LedgerMovementRow[],
  batchRows: BatchMetadataRow[],
) {
  const totalsByBatch = new Map<
    string,
    {
      product_id: string;
      location_id: string;
      qty_on_hand: number;
    }
  >();

  for (const row of ledgerRows) {
    if (!row.batch_id) {
      continue;
    }

    if (!Number.isFinite(row.qty) || row.qty <= 0) {
      continue;
    }

    const normalizedDirection = row.direction.toUpperCase();
    const delta = normalizedDirection === "IN" ? row.qty : normalizedDirection === "OUT" ? -row.qty : 0;
    if (delta === 0) {
      continue;
    }

    const existing = totalsByBatch.get(row.batch_id);
    if (existing) {
      existing.qty_on_hand += delta;
    } else {
      totalsByBatch.set(row.batch_id, {
        product_id: row.product_id,
        location_id: row.location_id,
        qty_on_hand: delta,
      });
    }
  }

  const batchById = new Map(batchRows.map((row) => [row.id, row]));
  const snapshotRows: StockBatchSnapshotRow[] = [];

  for (const [batchId, totals] of totalsByBatch) {
    if (totals.qty_on_hand <= 0) {
      continue;
    }

    const batch = batchById.get(batchId);
    if (!batch) {
      continue;
    }

    snapshotRows.push({
      ...batch,
      products: normalizeLookup(batch.products),
      locations: normalizeLookup(batch.locations),
      qty_on_hand: totals.qty_on_hand,
    });
  }

  return sortBatchRows(snapshotRows);
}

export function summarizeStockForExport(rows: StockBatchSnapshotRow[]) {
  const summaryByKey = new Map<string, StockExportSnapshotRow>();

  for (const row of rows) {
    const key = `${row.location_id}:${row.product_id}`;
    const current = summaryByKey.get(key);
    if (!current) {
      summaryByKey.set(key, {
        location_id: row.location_id,
        location_code: row.locations?.code ?? row.location_id,
        location_name: row.locations?.name ?? row.location_id,
        product_id: row.product_id,
        sku: row.products?.sku ?? row.product_id,
        product_name: row.products?.name ?? row.product_id,
        qty_on_hand: row.qty_on_hand,
        nearest_expiry_date: row.expiry_date,
      });
      continue;
    }

    current.qty_on_hand += row.qty_on_hand;

    if (
      row.expiry_date &&
      (!current.nearest_expiry_date || row.expiry_date < current.nearest_expiry_date)
    ) {
      current.nearest_expiry_date = row.expiry_date;
    }
  }

  return Array.from(summaryByKey.values()).sort((left, right) => {
    const locationCompare = left.location_name.localeCompare(right.location_name);
    if (locationCompare !== 0) {
      return locationCompare;
    }

    return left.product_name.localeCompare(right.product_name);
  });
}
