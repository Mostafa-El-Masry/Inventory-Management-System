import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  createServerSupabaseClientMock,
  resetPasswordForEmailMock,
  generateLinkMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  createServerSupabaseClientMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  generateLinkMock: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        generateLink: generateLinkMock,
      },
    },
  },
}));

vi.mock("@/lib/auth/trusted-origin", () => ({
  resolveTrustedOrigin: () => ({ origin: "https://app.example.com", trusted: true }),
}));

vi.mock("@/lib/server-env", () => ({
  serverEnv: {
    AUTH_DEV_RESET_FALLBACK_ENABLED: false,
  },
}));

import { POST } from "@/app/api/auth/reset-password/route";

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    createServerSupabaseClientMock.mockReset();
    resetPasswordForEmailMock.mockReset();
    generateLinkMock.mockReset();

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        resetPasswordForEmail: resetPasswordForEmailMock,
      },
    });
  });

  it("returns 200 for successful reset initiation", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    resetPasswordForEmailMock.mockResolvedValue({ error: null });

    const response = await POST(
      new Request("https://app.example.com/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns uniform success when provider reset fails", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    resetPasswordForEmailMock.mockResolvedValue({
      error: { message: "user not found" },
    });

    const response = await POST(
      new Request("https://app.example.com/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "missing@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 429 when rate limited", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      retryAfter: 90,
    });

    const response = await POST(
      new Request("https://app.example.com/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
  });

  it("returns 503 when limiter backend is unavailable", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      temporaryFailure: true,
      retryAfter: 60,
    });

    const response = await POST(
      new Request("https://app.example.com/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      error: "Password reset is temporarily unavailable. Please try again shortly.",
    });
  });
});
