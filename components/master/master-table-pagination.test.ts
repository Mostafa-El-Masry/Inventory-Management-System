import { describe, expect, it } from "vitest";

import { buildVisiblePaginationPages } from "@/components/master/master-table-pagination";

describe("buildVisiblePaginationPages", () => {
  it("shows first, previous, current, next, and last pages in the middle of the range", () => {
    expect(buildVisiblePaginationPages(100, 50)).toEqual([1, 49, 50, 51, 100]);
  });

  it("fills forward when the current page is near the start", () => {
    expect(buildVisiblePaginationPages(100, 1)).toEqual([1, 2, 3, 4, 100]);
    expect(buildVisiblePaginationPages(100, 2)).toEqual([1, 2, 3, 4, 100]);
  });

  it("fills backward when the current page is near the end", () => {
    expect(buildVisiblePaginationPages(100, 100)).toEqual([1, 97, 98, 99, 100]);
    expect(buildVisiblePaginationPages(100, 99)).toEqual([1, 97, 98, 99, 100]);
  });

  it("shows all pages when the total page count is already compact", () => {
    expect(buildVisiblePaginationPages(4, 2)).toEqual([1, 2, 3, 4]);
  });
});
