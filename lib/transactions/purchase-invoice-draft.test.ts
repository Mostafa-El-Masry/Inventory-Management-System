import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPurchaseDraftPayloadLines,
  createEmptyPurchaseDraftRow,
  ensureTrailingBlankPurchaseDraftRow,
  findPurchaseDraftMatches,
  getPurchaseDraftDefaultExpiryDate,
  getPurchaseDraftInitialSuggestionIndex,
  isBlankPurchaseDraftRow,
  movePurchaseDraftSuggestionIndex,
  type PurchaseDraftRow,
} from "@/lib/transactions/purchase-invoice-draft";

function buildRow(overrides: Partial<PurchaseDraftRow> = {}): PurchaseDraftRow {
  return {
    clientId: "row-1",
    productId: "product-1",
    skuQuery: "SKU-1001",
    itemQuery: "Buffer",
    qty: "2",
    unitCost: "4.50",
    lotNumber: "",
    expiryDate: "",
    ...overrides,
  };
}

describe("purchase invoice draft helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats a new draft row as blank", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T10:15:00"));

    const row = createEmptyPurchaseDraftRow("blank-row");

    expect(row.expiryDate).toBe("2027-03-21");
    expect(isBlankPurchaseDraftRow(row)).toBe(true);
  });

  it("requires at least three characters before returning matches", () => {
    const products = [
      { id: "product-1", sku: "SKU-1001", barcode: "111111", name: "Buffer" },
    ];

    expect(findPurchaseDraftMatches(products, "bu", "item")).toEqual([]);
    expect(findPurchaseDraftMatches(products, "sk", "sku")).toEqual([]);
  });

  it("matches item names and sku/barcode values by prefix", () => {
    const products = [
      { id: "product-1", sku: "SKU-1001", barcode: "111111", name: "Buffer Block" },
      { id: "product-2", sku: "SKU-2002", barcode: "222222", name: "Brush Set" },
      { id: "product-3", sku: "OTHER-1", barcode: "333333", name: "Comb" },
    ];

    expect(
      findPurchaseDraftMatches(products, "buf", "item").map((product) => product.id),
    ).toEqual(["product-1"]);
    expect(
      findPurchaseDraftMatches(products, "sku-", "sku").map((product) => product.id),
    ).toEqual(["product-1", "product-2"]);
    expect(
      findPurchaseDraftMatches(products, "222", "sku").map((product) => product.id),
    ).toEqual(["product-2"]);
  });

  it("builds the default expiry date from the runtime local date", () => {
    expect(getPurchaseDraftDefaultExpiryDate(new Date("2026-03-21T08:00:00"))).toBe(
      "2027-03-21",
    );
  });

  it("clamps the active suggestion index for keyboard navigation", () => {
    expect(getPurchaseDraftInitialSuggestionIndex(3)).toBe(0);
    expect(getPurchaseDraftInitialSuggestionIndex(0)).toBe(-1);
    expect(movePurchaseDraftSuggestionIndex(-1, "next", 3)).toBe(0);
    expect(movePurchaseDraftSuggestionIndex(0, "next", 3)).toBe(1);
    expect(movePurchaseDraftSuggestionIndex(2, "next", 3)).toBe(2);
    expect(movePurchaseDraftSuggestionIndex(0, "previous", 3)).toBe(0);
    expect(movePurchaseDraftSuggestionIndex(1, "previous", 3)).toBe(0);
  });

  it("keeps only populated rows plus a single trailing blank row", () => {
    const rows = ensureTrailingBlankPurchaseDraftRow(
      [
        buildRow({ clientId: "row-1" }),
        createEmptyPurchaseDraftRow("blank-1"),
        createEmptyPurchaseDraftRow("blank-2"),
      ],
      () => createEmptyPurchaseDraftRow("blank-final"),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.clientId).toBe("row-1");
    expect(rows[1]?.clientId).toBe("blank-final");
    expect(isBlankPurchaseDraftRow(rows[1]!)).toBe(true);
  });

  it("ignores one trailing blank row when building payload lines", () => {
    const result = buildPurchaseDraftPayloadLines([
      buildRow({ clientId: "row-1" }),
      createEmptyPurchaseDraftRow("blank-row"),
    ], "USD");

    expect(result.error).toBeNull();
    expect(result.lines).toEqual([
      {
        product_id: "product-1",
        qty: 2,
        lot_number: null,
        expiry_date: null,
        unit_cost: 4.5,
      },
    ]);
  });

  it("rejects partially filled unresolved rows", () => {
    const result = buildPurchaseDraftPayloadLines([
      buildRow({
        clientId: "row-1",
        productId: "",
        skuQuery: "SKU-1001",
        itemQuery: "",
      }),
    ], "USD");

    expect(result.error).toBe("Every item row must resolve to a product before saving.");
    expect(result.lines).toBeNull();
  });

  it("allows three decimal places for KWD costs", () => {
    const result = buildPurchaseDraftPayloadLines([
      buildRow({ unitCost: "4.125" }),
    ], "KWD");

    expect(result.error).toBeNull();
    expect(result.lines?.[0]?.unit_cost).toBe(4.125);
  });

  it("rejects more than two decimal places for USD and EGP costs", () => {
    const usdResult = buildPurchaseDraftPayloadLines([
      buildRow({ unitCost: "4.125" }),
    ], "USD");
    const egpResult = buildPurchaseDraftPayloadLines([
      buildRow({ unitCost: "4.125" }),
    ], "EGP");

    expect(usdResult.error).toBe("Cost can have at most 2 decimal places for USD.");
    expect(usdResult.lines).toBeNull();
    expect(egpResult.error).toBe("Cost can have at most 2 decimal places for EGP.");
    expect(egpResult.lines).toBeNull();
  });
});
