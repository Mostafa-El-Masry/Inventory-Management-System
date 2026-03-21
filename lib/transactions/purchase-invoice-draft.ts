import {
  hasSystemCurrencyValuePrecision,
  type SystemCurrencyCode,
} from "@/lib/settings/system-currency";

export type PurchaseLookupProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
};

export type PurchaseDraftRow = {
  clientId: string;
  productId: string;
  skuQuery: string;
  itemQuery: string;
  qty: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
};

export type PurchaseDraftPayloadLine = {
  product_id: string;
  qty: number;
  lot_number: string | null;
  expiry_date: string | null;
  unit_cost: number | null;
};

type PurchaseDraftMatchField = "item" | "sku";

export const PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH = 3;
export const PURCHASE_DRAFT_MATCH_LIMIT = 8;
export const PURCHASE_DRAFT_EMPTY_SUGGESTION_INDEX = -1;

function normalizeQuery(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPurchaseDraftDefaultExpiryDate(now = new Date()) {
  const expiryDate = new Date(now);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  return formatDateInputValue(expiryDate);
}

export function getPurchaseDraftInitialSuggestionIndex(matchCount: number) {
  return matchCount > 0 ? 0 : PURCHASE_DRAFT_EMPTY_SUGGESTION_INDEX;
}

export function movePurchaseDraftSuggestionIndex(
  currentIndex: number,
  direction: "next" | "previous",
  matchCount: number,
) {
  if (matchCount <= 0) {
    return PURCHASE_DRAFT_EMPTY_SUGGESTION_INDEX;
  }

  if (currentIndex < 0) {
    return 0;
  }

  if (direction === "next") {
    return Math.min(currentIndex + 1, matchCount - 1);
  }

  return Math.max(currentIndex - 1, 0);
}

export function createEmptyPurchaseDraftRow(clientId: string): PurchaseDraftRow {
  return {
    clientId,
    productId: "",
    skuQuery: "",
    itemQuery: "",
    qty: "",
    unitCost: "",
    lotNumber: "",
    expiryDate: getPurchaseDraftDefaultExpiryDate(),
  };
}

export function isBlankPurchaseDraftRow(row: PurchaseDraftRow) {
  const normalizedExpiryDate = normalizeQuery(row.expiryDate);
  const hasUserEnteredExpiry =
    normalizedExpiryDate !== "" &&
    normalizedExpiryDate !== normalizeQuery(getPurchaseDraftDefaultExpiryDate());

  return (
    row.productId.trim() === "" &&
    normalizeQuery(row.skuQuery) === "" &&
    normalizeQuery(row.itemQuery) === "" &&
    normalizeQuery(row.qty) === "" &&
    normalizeQuery(row.unitCost) === "" &&
    normalizeQuery(row.lotNumber) === "" &&
    !hasUserEnteredExpiry
  );
}

export function ensureTrailingBlankPurchaseDraftRow(
  rows: PurchaseDraftRow[],
  createRow: () => PurchaseDraftRow,
) {
  const populatedRows = rows.filter((row) => !isBlankPurchaseDraftRow(row));
  return [...populatedRows, createRow()];
}

export function getPurchaseDraftDisplaySku(product: PurchaseLookupProduct) {
  const sku = product.sku?.trim();
  if (sku) {
    return sku;
  }

  return product.barcode?.trim() ?? "";
}

export function findPurchaseDraftMatches(
  products: PurchaseLookupProduct[],
  query: string,
  field: PurchaseDraftMatchField,
  limit = PURCHASE_DRAFT_MATCH_LIMIT,
) {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH) {
    return [];
  }

  const matches: PurchaseLookupProduct[] = [];

  for (const product of products) {
    const normalizedName = normalizeQuery(product.name);
    const normalizedSku = normalizeQuery(product.sku);
    const normalizedBarcode = normalizeQuery(product.barcode);
    const isMatch =
      field === "item"
        ? normalizedName.startsWith(normalizedQuery)
        : normalizedSku.startsWith(normalizedQuery) ||
          normalizedBarcode.startsWith(normalizedQuery);

    if (!isMatch) {
      continue;
    }

    matches.push(product);
    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

export function buildPurchaseDraftPayloadLines(
  rows: PurchaseDraftRow[],
  currencyCode: SystemCurrencyCode,
) {
  const trailingBlankTrimmedRows =
    rows.length > 0 && isBlankPurchaseDraftRow(rows[rows.length - 1]!)
      ? rows.slice(0, -1)
      : rows;

  const normalizedLines: PurchaseDraftPayloadLine[] = [];

  for (const row of trailingBlankTrimmedRows) {
    if (isBlankPurchaseDraftRow(row)) {
      continue;
    }

    if (!row.productId.trim()) {
      return {
        error: "Every item row must resolve to a product before saving.",
        lines: null,
      } as const;
    }

    const qtyValue = row.qty.trim();
    const qty = Number(qtyValue);
    if (!Number.isInteger(qty) || qty <= 0) {
      return {
        error: "Every item row must have a quantity greater than zero.",
        lines: null,
      } as const;
    }

    const unitCostValue = row.unitCost.trim();
    const unitCost = unitCostValue === "" ? null : Number(unitCostValue);
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return {
        error: "Cost must be a positive number or left empty.",
        lines: null,
      } as const;
    }

    if (
      unitCostValue !== "" &&
      !hasSystemCurrencyValuePrecision(unitCostValue, currencyCode)
    ) {
      const fractionDigits = currencyCode === "KWD" ? 3 : 2;
      return {
        error: `Cost can have at most ${fractionDigits} decimal places for ${currencyCode}.`,
        lines: null,
      } as const;
    }

    normalizedLines.push({
      product_id: row.productId.trim(),
      qty,
      lot_number: row.lotNumber.trim() || null,
      expiry_date: row.expiryDate.trim() || null,
      unit_cost: unitCost == null ? null : unitCost,
    });
  }

  return {
    error: null,
    lines: normalizedLines,
  } as const;
}
