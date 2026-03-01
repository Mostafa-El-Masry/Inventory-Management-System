import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "@/lib/auth/callback-redirect";

describe("sanitizeNextPath", () => {
  it("rejects absolute external URLs", () => {
    expect(sanitizeNextPath("https://evil.example/path")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeNextPath("//evil.example/path")).toBe("/dashboard");
  });

  it("accepts valid internal paths", () => {
    expect(sanitizeNextPath("/reports?range=30d#top")).toBe("/reports?range=30d#top");
  });
});
