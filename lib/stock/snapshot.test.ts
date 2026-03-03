import { describe, expect, it } from "vitest";

import {
  buildBatchStockAsOfDate,
  parseAsOfDate,
  summarizeStockForExport,
} from "@/lib/stock/snapshot";

describe("stock snapshot helpers", () => {
  it("parses a valid as_of_date into an exclusive UTC cutoff", () => {
    const parsed = parseAsOfDate("2025-12-31");

    expect(parsed.error).toBeNull();
    expect(parsed.cutoffExclusiveIso).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects invalid as_of_date values", () => {
    const parsed = parseAsOfDate("31/12/2025");

    expect(parsed.cutoffExclusiveIso).toBeNull();
    expect(parsed.error).toBe("Invalid as_of_date. Use YYYY-MM-DD (for example 2025-12-31).");
  });

  it("builds as-of batch stock from IN/OUT ledger rows", () => {
    const rows = buildBatchStockAsOfDate(
      [
        { batch_id: "batch-1", product_id: "product-1", location_id: "loc-1", direction: "IN", qty: 10 },
        { batch_id: "batch-1", product_id: "product-1", location_id: "loc-1", direction: "OUT", qty: 4 },
        { batch_id: "batch-2", product_id: "product-1", location_id: "loc-1", direction: "IN", qty: 3 },
        { batch_id: "batch-2", product_id: "product-1", location_id: "loc-1", direction: "OUT", qty: 3 },
      ],
      [
        {
          id: "batch-1",
          product_id: "product-1",
          location_id: "loc-1",
          lot_number: "LOT-1",
          expiry_date: "2026-01-10",
          received_at: "2025-12-01T00:00:00.000Z",
          unit_cost: 2.5,
          products: { name: "Paracetamol", sku: "PAR-01" },
          locations: { name: "Sabah Al Salem", code: "SAB-01" },
        },
        {
          id: "batch-2",
          product_id: "product-1",
          location_id: "loc-1",
          lot_number: "LOT-2",
          expiry_date: "2026-02-10",
          received_at: "2025-12-02T00:00:00.000Z",
          unit_cost: 2.5,
          products: { name: "Paracetamol", sku: "PAR-01" },
          locations: { name: "Sabah Al Salem", code: "SAB-01" },
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "batch-1",
      qty_on_hand: 6,
    });
  });

  it("summarizes batch rows into location/product export rows", () => {
    const summary = summarizeStockForExport([
      {
        id: "batch-1",
        product_id: "product-1",
        location_id: "loc-1",
        lot_number: "LOT-1",
        expiry_date: "2026-01-10",
        received_at: "2025-12-01T00:00:00.000Z",
        qty_on_hand: 6,
        unit_cost: 2.5,
        products: { name: "Paracetamol", sku: "PAR-01" },
        locations: { name: "Sabah Al Salem", code: "SAB-01" },
      },
      {
        id: "batch-2",
        product_id: "product-1",
        location_id: "loc-1",
        lot_number: "LOT-2",
        expiry_date: "2026-01-05",
        received_at: "2025-12-02T00:00:00.000Z",
        qty_on_hand: 4,
        unit_cost: 2.5,
        products: { name: "Paracetamol", sku: "PAR-01" },
        locations: { name: "Sabah Al Salem", code: "SAB-01" },
      },
    ]);

    expect(summary).toEqual([
      {
        location_id: "loc-1",
        location_code: "SAB-01",
        location_name: "Sabah Al Salem",
        product_id: "product-1",
        sku: "PAR-01",
        product_name: "Paracetamol",
        qty_on_hand: 10,
        nearest_expiry_date: "2026-01-05",
      },
    ]);
  });
});
