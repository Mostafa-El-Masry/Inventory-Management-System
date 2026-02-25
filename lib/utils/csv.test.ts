import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/utils/csv";

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
