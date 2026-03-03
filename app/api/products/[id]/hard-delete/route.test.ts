import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  txCountEqMock,
  deleteEqMock,
  deleteSelectMock,
  deleteMaybeSingleMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  txCountEqMock: vi.fn(),
  deleteEqMock: vi.fn(),
  deleteSelectMock: vi.fn(),
  deleteMaybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { POST } from "@/app/api/products/[id]/hard-delete/route";

describe("POST /api/products/[id]/hard-delete", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    txCountEqMock.mockReset();
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
        id: "product-1",
        sku: "SKU-1001",
        name: "Paracetamol",
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
      if (table === "inventory_transaction_lines") {
        return {
          select: vi.fn().mockReturnValue({
            eq: txCountEqMock,
          }),
        };
      }
      if (table === "products") {
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

  it("returns 409 when linked transactions exist", async () => {
    txCountEqMock.mockResolvedValue({
      count: 2,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot hard delete product with linked transactions.",
      details: {
        field: "product_id",
        product_id: "product-1",
      },
    });
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("hard deletes when no linked transactions exist", async () => {
    txCountEqMock.mockResolvedValue({
      count: 0,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "product-1",
      sku: "SKU-1001",
      name: "Paracetamol",
    });
    expect(deleteEqMock).toHaveBeenCalledWith("id", "product-1");
  });
});
