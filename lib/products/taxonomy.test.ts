import { describe, expect, it } from "vitest";

import {
  nextCategoryCode,
  nextSubcategoryCode,
  normalizeTaxonomyName,
} from "@/lib/products/taxonomy";

describe("product taxonomy helpers", () => {
  it("normalizes taxonomy name", () => {
    expect(normalizeTaxonomyName("  Hair Care ")).toBe("hair care");
  });

  it("builds next category code", () => {
    expect(nextCategoryCode([])).toBe("01");
    expect(nextCategoryCode(["01", "02", "09"])).toBe("10");
  });

  it("builds next subcategory code", () => {
    expect(nextSubcategoryCode([])).toBe("001");
    expect(nextSubcategoryCode(["001", "099"])).toBe("100");
  });

  it("returns null when code space is exhausted", () => {
    expect(nextCategoryCode(["99"])).toBeNull();
    expect(nextSubcategoryCode(["999"])).toBeNull();
  });
});
