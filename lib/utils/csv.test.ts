import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "@/lib/utils/csv";

describe("toCsv", () => {
  it("returns empty string for empty rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("generates csv headers and values", () => {
    const csv = toCsv([
      { sku: "SKU-1", qty: 5 },
      { sku: "SKU-2", qty: 9 },
    ]);

    expect(csv).toContain("sku,qty");
    expect(csv).toContain("SKU-1,5");
    expect(csv).toContain("SKU-2,9");
  });

  it("escapes quotes and commas", () => {
    const csv = toCsv([{ note: 'hello, "world"' }]);

    expect(csv).toBe('note\n"hello, ""world"""');
  });
});

describe("parseCsv", () => {
  it("parses simple csv rows", () => {
    expect(parseCsv("name,unit\nParacetamol,box")).toEqual([
      ["name", "unit"],
      ["Paracetamol", "box"],
    ]);
  });

  it("parses quoted commas and escaped quotes", () => {
    expect(parseCsv('name,description\n"Vitamin, C","hello ""world"""')).toEqual([
      ["name", "description"],
      ["Vitamin, C", 'hello "world"'],
    ]);
  });

  it("throws on malformed quoted csv", () => {
    expect(() => parseCsv('name\n"broken')).toThrow(
      "Invalid CSV format: unterminated quoted field.",
    );
  });
});
