import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  createServerSupabaseClientMock,
  signInWithPasswordMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  createServerSupabaseClientMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { POST } from "@/app/api/auth/login/route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    createServerSupabaseClientMock.mockReset();
    signInWithPasswordMock.mockReset();

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: signInWithPasswordMock,
      },
    });
  });

  it("returns 200 on successful login", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await POST(
      new Request("https://app.example.com/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "User@Example.com",
          password: "StrongPass123!",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 401 when credentials are invalid", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    const response = await POST(
      new Request("https://app.example.com/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "user@example.com",
          password: "wrong-password",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid login credentials.",
    });
  });

  it("returns 429 when rate limited", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      retryAfter: 123,
    });

    const response = await POST(
      new Request("https://app.example.com/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "user@example.com",
          password: "StrongPass123!",
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("123");
  });

  it("returns 503 when limiter backend is unavailable", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      temporaryFailure: true,
      retryAfter: 45,
    });

    const response = await POST(
      new Request("https://app.example.com/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "user@example.com",
          password: "StrongPass123!",
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("45");
    await expect(response.json()).resolves.toEqual({
      error: "Authentication service is temporarily unavailable. Please try again shortly.",
    });
  });
});
