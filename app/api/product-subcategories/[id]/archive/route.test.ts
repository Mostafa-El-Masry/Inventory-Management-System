import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  updateEqMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  updateEqMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { POST } from "@/app/api/product-subcategories/[id]/archive/route";

describe("POST /api/product-subcategories/[id]/archive", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    updateEqMock.mockReset();
    selectMock.mockReset();
    singleMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: {},
      supabase: {
        from: fromMock,
      },
    });
    assertRoleMock.mockReturnValue(null);

    singleMock.mockResolvedValue({
      data: {
        id: "sub-1",
        category_id: "cat-1",
        code: "001",
        name: "Shampoo",
        is_active: false,
      },
      error: null,
    });
    selectMock.mockReturnValue({
      single: singleMock,
    });
    updateEqMock.mockReturnValue({
      select: selectMock,
    });
    fromMock.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: updateEqMock,
      }),
    });
  });

  it("archives subcategory for admin", async () => {
    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "sub-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "sub-1",
      category_id: "cat-1",
      code: "001",
      name: "Shampoo",
      is_active: false,
    });
    expect(updateEqMock).toHaveBeenCalledWith("id", "sub-1");
  });

  it("returns role error for non-admin", async () => {
    assertRoleMock.mockReturnValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "sub-1" }),
    });

    expect(response.status).toBe(403);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
