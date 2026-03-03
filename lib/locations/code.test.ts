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
    expect(nextPrefixedCode("SAB", ["SAB-01", "SAB-02"])).toBe("SAB-03");
  });

  it("handles suffix values above 99 without truncation", () => {
    expect(nextPrefixedCode("SAB", ["SAB-99"])).toBe("SAB-100");
  });
});
