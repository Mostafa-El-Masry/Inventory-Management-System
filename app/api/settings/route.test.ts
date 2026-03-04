import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  selectMock,
  eqMock,
  maybeSingleMock,
  upsertMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  maybeSingleMock: vi.fn(),
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
    eqMock.mockReset();
    maybeSingleMock.mockReset();
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

  it("GET returns company name", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { value_text: "ICE Trading" },
      error: null,
    });
    eqMock.mockReturnValue({
      maybeSingle: maybeSingleMock,
    });
    selectMock.mockReturnValue({
      eq: eqMock,
    });
    fromMock.mockReturnValue({
      select: selectMock,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      company_name: "ICE Trading",
    });
  });

  it("POST updates company name for admin", async () => {
    upsertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({
      upsert: upsertMock,
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings", {
        method: "POST",
        body: JSON.stringify({ company_name: "Casa Spa Group" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      {
        key: "company_name",
        value_text: "Casa Spa Group",
      },
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
        body: JSON.stringify({ company_name: "Casa Spa Group" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(403);
  });
});
