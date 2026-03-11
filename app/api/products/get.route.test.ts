import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  getAuthContextMock,
  hasMasterPermissionMock,
  linesInMock,
  linesSelectMock,
  productEqMock,
  productOrderMock,
  productRangeMock,
  productSelectMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAuthContextMock: vi.fn(),
  hasMasterPermissionMock: vi.fn(),
  linesInMock: vi.fn(),
  linesSelectMock: vi.fn(),
  productEqMock: vi.fn(),
  productOrderMock: vi.fn(),
  productRangeMock: vi.fn(),
  productSelectMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: vi.fn(),
  hasMasterPermission: hasMasterPermissionMock,
}));

import { GET } from "@/app/api/products/route";

function buildProduct(index: number) {
  return {
    id: `product-${index}`,
    sku: `01-001-${String(index).padStart(4, "0")}`,
    name: `Product ${index}`,
    barcode: null,
    unit: "box",
    description: null,
    is_active: true,
    category_id: "cat-1",
    subcategory_id: "sub-1",
    category: { id: "cat-1", code: "01", name: "Hair" },
    subcategory: { id: "sub-1", category_id: "cat-1", code: "001", name: "Shampoo" },
  };
}

describe("GET /api/products", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAuthContextMock.mockReset();
    hasMasterPermissionMock.mockReset();
    linesInMock.mockReset();
    linesSelectMock.mockReset();
    productEqMock.mockReset();
    productOrderMock.mockReset();
    productRangeMock.mockReset();
    productSelectMock.mockReset();

    const productBuilder = {
      eq: productEqMock,
      order: productOrderMock,
      range: productRangeMock,
    };

    productEqMock.mockReturnValue(productBuilder);
    productOrderMock.mockReturnValue(productBuilder);
    productSelectMock.mockReturnValue(productBuilder);

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
    hasMasterPermissionMock.mockReturnValue(true);
  });

  it("returns taxonomy labels and can_hard_delete for admin", async () => {
    productRangeMock.mockResolvedValueOnce({
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
      count: null,
    });

    const response = await GET(new Request("https://app.example.com/api/products"));

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      items: Array<Record<string, unknown>>;
      pagination: Record<string, unknown>;
    };
    expect(productRangeMock).toHaveBeenCalledWith(0, 499);
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
    expect(json.pagination).toEqual({
      totalItems: 2,
      totalPages: 1,
      currentPage: 1,
      pageSize: null,
    });
  });

  it("returns paginated metadata for server-side paging", async () => {
    productRangeMock.mockResolvedValueOnce({
      data: Array.from({ length: 25 }, (_, index) => buildProduct(index + 26)),
      error: null,
      count: 60,
    });
    linesInMock.mockResolvedValue({
      data: [],
      error: null,
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/products?page=2&limit=25&sort=sku&direction=desc&include_inactive=true",
      ),
    );

    expect(response.status).toBe(200);
    expect(productSelectMock).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(productRangeMock).toHaveBeenCalledWith(25, 49);

    const json = (await response.json()) as {
      items: Array<Record<string, unknown>>;
      pagination: Record<string, unknown>;
    };
    expect(json.items).toHaveLength(25);
    expect(json.pagination).toEqual({
      totalItems: 60,
      totalPages: 3,
      currentPage: 2,
      pageSize: 25,
    });
  });

  it("loads every batch when products are requested without pagination", async () => {
    productRangeMock
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, index) => buildProduct(index + 1)),
        error: null,
        count: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, index) => buildProduct(index + 501)),
        error: null,
        count: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 200 }, (_, index) => buildProduct(index + 1001)),
        error: null,
        count: null,
      });
    linesInMock.mockResolvedValue({
      data: [],
      error: null,
    });

    const response = await GET(
      new Request("https://app.example.com/api/products?include_inactive=true&sort=sku"),
    );

    expect(response.status).toBe(200);
    expect(productRangeMock).toHaveBeenNthCalledWith(1, 0, 499);
    expect(productRangeMock).toHaveBeenNthCalledWith(2, 500, 999);
    expect(productRangeMock).toHaveBeenNthCalledWith(3, 1000, 1499);

    const json = (await response.json()) as {
      items: Array<Record<string, unknown>>;
      pagination: Record<string, unknown>;
    };
    expect(json.items).toHaveLength(1200);
    expect(json.pagination).toEqual({
      totalItems: 1200,
      totalPages: 1,
      currentPage: 1,
      pageSize: null,
    });
  });

  it("batches linked transaction lookups when loading a large product list", async () => {
    const products = Array.from({ length: 450 }, (_, index) => buildProduct(index + 1));

    productRangeMock.mockResolvedValueOnce({
      data: products,
      error: null,
      count: null,
    });

    linesInMock
      .mockResolvedValueOnce({
        data: [{ product_id: "product-1" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ product_id: "product-225" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ product_id: "product-450" }],
        error: null,
      });

    const response = await GET(
      new Request("https://app.example.com/api/products?include_inactive=true"),
    );

    expect(response.status).toBe(200);
    expect(linesInMock).toHaveBeenCalledTimes(3);
    expect(linesInMock).toHaveBeenNthCalledWith(
      1,
      "product_id",
      products.slice(0, 200).map((product) => product.id),
    );
    expect(linesInMock).toHaveBeenNthCalledWith(
      2,
      "product_id",
      products.slice(200, 400).map((product) => product.id),
    );
    expect(linesInMock).toHaveBeenNthCalledWith(
      3,
      "product_id",
      products.slice(400).map((product) => product.id),
    );

    const json = (await response.json()) as { items: Array<Record<string, unknown>> };
    expect(json.items[0]?.can_hard_delete).toBe(false);
    expect(json.items[224]?.can_hard_delete).toBe(false);
    expect(json.items[449]?.can_hard_delete).toBe(false);
    expect(json.items[1]?.can_hard_delete).toBe(true);
  });
});
