import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: rpcMock,
  },
}));

import { checkRateLimit } from "@/lib/auth/rate-limit";

describe("auth rate limiter", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("checks IP and normalized email buckets for login", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ allowed: true, retry_after_seconds: 0 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ allowed: true, retry_after_seconds: 0 }],
        error: null,
      });

    const request = new Request("https://app.example.com/api/auth/login", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
    });

    const result = await checkRateLimit(request, "login", "User@Example.com");

    expect(result).toEqual({ allowed: true });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenNthCalledWith(1, "rpc_check_rate_limit", {
      p_endpoint: "login",
      p_bucket: "ip:203.0.113.10",
      p_limit: 30,
      p_window_seconds: 900,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "rpc_check_rate_limit", {
      p_endpoint: "login",
      p_bucket: "email:user@example.com",
      p_limit: 8,
      p_window_seconds: 900,
    });
  });

  it("returns denied with strictest retry-after", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ allowed: false, retry_after_seconds: 40 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ allowed: false, retry_after_seconds: 120 }],
        error: null,
      });

    const request = new Request("https://app.example.com/api/auth/reset-password", {
      headers: {
        "x-real-ip": "198.51.100.9",
      },
    });

    const result = await checkRateLimit(
      request,
      "reset-password",
      "locked@example.com",
    );

    expect(result).toEqual({ allowed: false, retryAfter: 120 });
  });

  it("only checks IP bucket when email is missing", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });

    const request = new Request("https://app.example.com/api/auth/login");
    const result = await checkRateLimit(request, "login");

    expect(result).toEqual({ allowed: true });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
