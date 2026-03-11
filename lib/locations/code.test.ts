import { describe, expect, it } from "vitest";

import { deriveNamePrefix, nextPrefixedCode } from "@/lib/locations/code";

describe("prefixed code helpers", () => {
  it("derives prefix from a normal name", () => {
    expect(deriveNamePrefix("Paracetamol", "PRD")).toBe("PAR");
  });

  it("falls back to configured prefix when name has no usable letters", () => {
    expect(deriveNamePrefix("---", "PRD")).toBe("PRD");
  });

  it("picks the next suffix from existing codes", () => {
    expect(nextPrefixedCode("LON", ["LON-01", "LON-02"])).toBe("LON-03");
  });

  it("handles suffix values above 99 without truncation", () => {
    expect(nextPrefixedCode("LON", ["LON-99"])).toBe("LON-100");
  });
});
