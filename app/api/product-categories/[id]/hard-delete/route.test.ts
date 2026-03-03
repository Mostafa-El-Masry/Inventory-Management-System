import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  subcategoryCountEqMock,
  productCountEqMock,
  deleteEqMock,
  deleteSelectMock,
  deleteMaybeSingleMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  subcategoryCountEqMock: vi.fn(),
  productCountEqMock: vi.fn(),
  deleteEqMock: vi.fn(),
  deleteSelectMock: vi.fn(),
  deleteMaybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { POST } from "@/app/api/product-categories/[id]/hard-delete/route";

describe("POST /api/product-categories/[id]/hard-delete", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    subcategoryCountEqMock.mockReset();
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
        id: "cat-1",
        code: "01",
        name: "Hair",
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
      if (table === "product_subcategories") {
        return {
          select: vi.fn().mockReturnValue({
            eq: subcategoryCountEqMock,
          }),
        };
      }
      if (table === "products") {
        return {
          select: vi.fn().mockReturnValue({
            eq: productCountEqMock,
          }),
        };
      }
      if (table === "product_categories") {
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

  it("returns 409 when linked subcategories exist", async () => {
    subcategoryCountEqMock.mockResolvedValue({
      count: 1,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "cat-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot hard delete category with linked subcategories.",
      details: {
        field: "category_id",
        category_id: "cat-1",
      },
    });
    expect(productCountEqMock).not.toHaveBeenCalled();
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("returns 409 when linked products exist", async () => {
    subcategoryCountEqMock.mockResolvedValue({
      count: 0,
      error: null,
    });
    productCountEqMock.mockResolvedValue({
      count: 2,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "cat-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot hard delete category with linked products.",
      details: {
        field: "category_id",
        category_id: "cat-1",
      },
    });
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("hard deletes category when no linked rows exist", async () => {
    subcategoryCountEqMock.mockResolvedValue({
      count: 0,
      error: null,
    });
    productCountEqMock.mockResolvedValue({
      count: 0,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "cat-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "cat-1",
      code: "01",
      name: "Hair",
      is_active: false,
    });
    expect(deleteEqMock).toHaveBeenCalledWith("id", "cat-1");
  });
});
