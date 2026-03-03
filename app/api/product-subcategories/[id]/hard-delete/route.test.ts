import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  productCountEqMock,
  deleteEqMock,
  deleteSelectMock,
  deleteMaybeSingleMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  productCountEqMock: vi.fn(),
  deleteEqMock: vi.fn(),
  deleteSelectMock: vi.fn(),
  deleteMaybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { POST } from "@/app/api/product-subcategories/[id]/hard-delete/route";

describe("POST /api/product-subcategories/[id]/hard-delete", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    productCountEqMock.mockReset();
    deleteEqMock.mockReset();
    deleteSelectMock.mockReset();
    deleteMaybeSingleMock.mockReset();

    assertRoleMock.mockReturnValue(null);
    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: {},
      supabase: {
        from: fromMock,
      },
    });

    deleteMaybeSingleMock.mockResolvedValue({
      data: {
        id: "sub-1",
        category_id: "cat-1",
        code: "001",
        name: "Shampoo",
        is_active: false,
      },
      error: null,
    });
    deleteSelectMock.mockReturnValue({
      maybeSingle: deleteMaybeSingleMock,
    });
    deleteEqMock.mockReturnValue({
      select: deleteSelectMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "products") {
        return {
          select: vi.fn().mockReturnValue({
            eq: productCountEqMock,
          }),
        };
      }
      if (table === "product_subcategories") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: deleteEqMock,
          }),
        };
      }
      return {
        select: vi.fn(),
      };
    });
  });

  it("returns 409 when linked products exist", async () => {
    productCountEqMock.mockResolvedValue({
      count: 1,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "sub-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot hard delete subcategory with linked products.",
      details: {
        field: "subcategory_id",
        subcategory_id: "sub-1",
      },
    });
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("hard deletes subcategory when no linked products exist", async () => {
    productCountEqMock.mockResolvedValue({
      count: 0,
      error: null,
    });

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
    expect(deleteEqMock).toHaveBeenCalledWith("id", "sub-1");
  });
});
