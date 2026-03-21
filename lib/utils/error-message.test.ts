import { describe, expect, it } from "vitest";

import { sanitizeErrorMessage } from "@/lib/utils/error-message";

describe("sanitizeErrorMessage", () => {
  it("preserves plain application errors", () => {
    expect(sanitizeErrorMessage("Supplier not found.", "Request failed.")).toBe(
      "Supplier not found.",
    );
  });

  it("replaces upstream html error pages with a generic message", () => {
    const html = `<!DOCTYPE html><html><head><title>502: Bad gateway</title></head><body>Cloudflare Ray ID</body></html>`;

    expect(sanitizeErrorMessage(html, "Request failed.")).toBe(
      "The service is temporarily unavailable. Please try again.",
    );
  });

  it("falls back when the original message is empty", () => {
    expect(sanitizeErrorMessage("   ", "Request failed.")).toBe("Request failed.");
  });
});
