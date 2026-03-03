import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  fromMock,
  productEqMock,
  productOrderMock,
  linesInMock,
  linesSelectMock,
  productSelectMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  fromMock: vi.fn(),
  productEqMock: vi.fn(),
  productOrderMock: vi.fn(),
  linesInMock: vi.fn(),
  linesSelectMock: vi.fn(),
  productSelectMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: vi.fn(),
}));

import { GET } from "@/app/api/products/route";

describe("GET /api/products", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    fromMock.mockReset();
    productEqMock.mockReset();
    productOrderMock.mockReset();
    linesInMock.mockReset();
    linesSelectMock.mockReset();
    productSelectMock.mockReset();

    productEqMock.mockResolvedValue({
      data: [
        {
          id: "product-1",
          sku: "01-001-0001",
          name: "Paracetamol",
          barcode: null,
          unit: "box",
          description: null,
          is_active: true,
          category_id: "cat-1",
          subcategory_id: "sub-1",
          category: { id: "cat-1", code: "01", name: "Hair" },
          subcategory: { id: "sub-1", category_id: "cat-1", code: "001", name: "Shampoo" },
        },
        {
          id: "product-2",
          sku: "02-003-0000",
          name: "Vitamin C",
          barcode: null,
          unit: "box",
          description: null,
          is_active: true,
          category_id: "cat-2",
          subcategory_id: "sub-3",
          category: [{ id: "cat-2", code: "02", name: "Skin" }],
          subcategory: [{ id: "sub-3", category_id: "cat-2", code: "003", name: "Cream" }],
        },
      ],
      error: null,
    });

    productOrderMock.mockReturnValue({
      eq: productEqMock,
    });
    productSelectMock.mockReturnValue({
      order: productOrderMock,
    });

    linesInMock.mockResolvedValue({
      data: [{ product_id: "product-1" }],
      error: null,
    });
    linesSelectMock.mockReturnValue({
      in: linesInMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "products") {
        return {
          select: productSelectMock,
        };
      }
      if (table === "inventory_transaction_lines") {
        return {
          select: linesSelectMock,
        };
      }
      return {
        select: vi.fn(),
      };
    });

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: {},
      supabase: {
        from: fromMock,
      },
    });
  });

  it("returns taxonomy labels and can_hard_delete for admin", async () => {
    const response = await GET(new Request("https://app.example.com/api/products"));

    expect(response.status).toBe(200);
    const json = (await response.json()) as { items: Array<Record<string, unknown>> };
    expect(json.items).toEqual([
      {
        id: "product-1",
        sku: "01-001-0001",
        name: "Paracetamol",
        barcode: null,
        unit: "box",
        description: null,
        is_active: true,
        category_id: "cat-1",
        subcategory_id: "sub-1",
        category: { id: "cat-1", code: "01", name: "Hair" },
        subcategory: { id: "sub-1", category_id: "cat-1", code: "001", name: "Shampoo" },
        category_code: "01",
        category_name: "Hair",
        subcategory_code: "001",
        subcategory_name: "Shampoo",
        can_hard_delete: false,
      },
      {
        id: "product-2",
        sku: "02-003-0000",
        name: "Vitamin C",
        barcode: null,
        unit: "box",
        description: null,
        is_active: true,
        category_id: "cat-2",
        subcategory_id: "sub-3",
        category: { id: "cat-2", code: "02", name: "Skin" },
        subcategory: { id: "sub-3", category_id: "cat-2", code: "003", name: "Cream" },
        category_code: "02",
        category_name: "Skin",
        subcategory_code: "003",
        subcategory_name: "Cream",
        can_hard_delete: true,
      },
    ]);
  });
});
