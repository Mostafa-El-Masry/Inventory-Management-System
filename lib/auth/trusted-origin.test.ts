import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("trusted origin resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.APP_ORIGIN_ALLOWLIST =
      "https://app.example.com, https://staging.example.com";
    process.env.AUTH_DEV_RESET_FALLBACK_ENABLED = "false";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("accepts trusted request origins", async () => {
    const { getAllowedOrigins, resolveTrustedOrigin } = await import(
      "@/lib/auth/trusted-origin"
    );

    expect(getAllowedOrigins()).toEqual([
      "https://app.example.com",
      "https://staging.example.com",
    ]);

    const request = new Request("https://app.example.com/api/auth/reset-password");
    expect(resolveTrustedOrigin(request)).toEqual({
      origin: "https://app.example.com",
      trusted: true,
    });
  });

  it("falls back to canonical origin for untrusted requests", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { resolveTrustedOrigin } = await import("@/lib/auth/trusted-origin");

    const request = new Request("https://attacker.example.net/api/auth/reset-password");
    expect(resolveTrustedOrigin(request)).toEqual({
      origin: "https://app.example.com",
      trusted: false,
    });

    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
