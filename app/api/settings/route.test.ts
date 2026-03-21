import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  selectMock,
  inMock,
  upsertMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  inMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { GET, POST } from "@/app/api/settings/route";

describe("Settings API", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    selectMock.mockReset();
    inMock.mockReset();
    upsertMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: { canManageSystemSettings: true },
      supabase: {
        from: fromMock,
      },
    });

    assertRoleMock.mockReturnValue(null);
  });

  it("GET returns company name and currency code", async () => {
    inMock.mockResolvedValue({
      data: [
        { key: "company_name", value_text: "ICE Trading" },
        { key: "currency_code", value_text: "USD" },
      ],
      error: null,
    });
    selectMock.mockReturnValue({
      in: inMock,
    });
    fromMock.mockReturnValue({
      select: selectMock,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      company_name: "ICE Trading",
      currency_code: "USD",
    });
  });

  it("GET falls back to KWD when currency is missing", async () => {
    inMock.mockResolvedValue({
      data: [{ key: "company_name", value_text: "ICE Trading" }],
      error: null,
    });
    selectMock.mockReturnValue({
      in: inMock,
    });
    fromMock.mockReturnValue({
      select: selectMock,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      company_name: "ICE Trading",
      currency_code: "KWD",
    });
  });

  it("POST updates company name and currency for admin", async () => {
    upsertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({
      upsert: upsertMock,
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings", {
        method: "POST",
        body: JSON.stringify({
          company_name: "Casa Spa Group",
          currency_code: "EGP",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      [
        {
          key: "company_name",
          value_text: "Casa Spa Group",
        },
        {
          key: "currency_code",
          value_text: "EGP",
        },
      ],
      { onConflict: "key" },
    );
  });

  it("POST rejects non-admin", async () => {
    assertRoleMock.mockReturnValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("https://app.example.com/api/settings", {
        method: "POST",
        body: JSON.stringify({
          company_name: "Casa Spa Group",
          currency_code: "KWD",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("POST rejects unsupported currency codes", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/settings", {
        method: "POST",
        body: JSON.stringify({
          company_name: "Casa Spa Group",
          currency_code: "AED",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(422);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
