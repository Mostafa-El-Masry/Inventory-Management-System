import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  createProductWithGeneratedSkuMock,
  productsCountSelectMock,
  productsCatalogSelectMock,
  categoriesSelectMock,
  subcategoriesSelectMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  createProductWithGeneratedSkuMock: vi.fn(),
  productsCountSelectMock: vi.fn(),
  productsCatalogSelectMock: vi.fn(),
  categoriesSelectMock: vi.fn(),
  subcategoriesSelectMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
  assertMasterPermission: assertRoleMock,
}));

vi.mock("@/lib/products/create", () => ({
  createProductWithGeneratedSku: createProductWithGeneratedSkuMock,
}));

import { POST } from "@/app/api/products/import/route";

describe("POST /api/products/import", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    createProductWithGeneratedSkuMock.mockReset();
    productsCountSelectMock.mockReset();
    productsCatalogSelectMock.mockReset();
    categoriesSelectMock.mockReset();
    subcategoriesSelectMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin" },
      locationIds: [],
      supabase: {
        from: fromMock,
      },
    });
    assertRoleMock.mockReturnValue(null);

    productsCountSelectMock.mockResolvedValue({
      count: 3,
      error: null,
    });
    productsCatalogSelectMock.mockResolvedValue({
      data: [],
      error: null,
    });
    categoriesSelectMock.mockResolvedValue({
      data: [
        { id: "cat-1", name: "Hair", is_active: true },
        { id: "cat-2", name: "Skin", is_active: true },
      ],
      error: null,
    });
    subcategoriesSelectMock.mockResolvedValue({
      data: [
        { id: "sub-1", category_id: "cat-1", name: "Shampoo", is_active: true },
        { id: "sub-2", category_id: "cat-1", name: "Conditioner", is_active: true },
        { id: "sub-3", category_id: "cat-2", name: "Cream", is_active: true },
      ],
      error: null,
    });

    createProductWithGeneratedSkuMock.mockResolvedValue({
      data: { id: "new-product" },
      error: null,
      status: 201,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "products") {
        return {
          select: (columns: string, options?: { count?: "exact"; head?: boolean }) => {
            if (columns === "id" && options?.count === "exact" && options?.head === true) {
              return productsCountSelectMock();
            }
            if (columns === "id, name, barcode") {
              return productsCatalogSelectMock();
            }
            return Promise.resolve({
              data: [],
              error: null,
            });
          },
        };
      }

      if (table === "product_categories") {
        return {
          select: categoriesSelectMock,
        };
      }

      if (table === "product_subcategories") {
        return {
          select: subcategoriesSelectMock,
        };
      }

      return {
        select: vi.fn(),
      };
    });
  });

  it("keeps first duplicate name row and rejects subsequent duplicate rows", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: [
            "name,category_name,subcategory_name,barcode,unit,is_active,description",
            "Paracetamol,Hair,Shampoo,8901000000011,box,true,Tablet",
            " paracetamol ,Hair,Conditioner,,box,true,Tablet duplicate",
          ].join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: 1,
      rejected_count: 1,
      processed_count: 2,
      rejected_rows: [
        {
          row_number: 3,
          name: "Paracetamol",
          barcode: null,
          reason: "Duplicate name in CSV.",
          first_row_number: 2,
        },
      ],
      max_rows: 500,
      max_products: 10000,
      current_count: 4,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(1);
  });

  it("skips rows with unknown taxonomy and continues with valid rows", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: [
            "name,category_name,subcategory_name,barcode,unit,is_active,description",
            "Paracetamol,Unknown,Shampoo,8901000000011,box,true,Tablet",
            "Vitamin C,Hair,Conditioner,8901000000012,box,true,Effervescent",
          ].join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: 1,
      rejected_count: 1,
      processed_count: 2,
      rejected_rows: [
        {
          row_number: 2,
          name: "Paracetamol",
          barcode: "8901000000011",
          reason: 'Category "Unknown" does not exist in masters.',
        },
      ],
      max_rows: 500,
      max_products: 10000,
      current_count: 4,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(1);
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Vitamin C",
        category_id: "cat-1",
        subcategory_id: "sub-2",
      }),
    );
  });

  it("skips existing-name conflicts and still imports other valid rows", async () => {
    productsCatalogSelectMock.mockResolvedValue({
      data: [
        {
          id: "product-existing",
          name: "Paracetamol",
          barcode: "8901000000099",
        },
      ],
      error: null,
    });

    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: [
            "name,category_name,subcategory_name,barcode,unit,is_active,description",
            " paracetamol ,Hair,Shampoo,8901000000011,box,true,Tablet",
            "Vitamin C,Hair,Conditioner,8901000000012,box,true,Effervescent",
          ].join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: 1,
      rejected_count: 1,
      processed_count: 2,
      rejected_rows: [
        {
          row_number: 2,
          name: "Paracetamol",
          barcode: "8901000000011",
          reason: "Name already exists in catalog.",
          existing_product_id: "product-existing",
        },
      ],
      max_rows: 500,
      max_products: 10000,
      current_count: 4,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(1);
  });

  it("stores imported product names in proper case while keeping taxonomy lookup case-insensitive", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: [
            "name,category_name,subcategory_name,barcode,unit,is_active,description",
            "  hAIR   repair   serum  ,hAIR,conDitioner,8901000000012,box,true,Effervescent",
          ].join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Hair Repair Serum",
        category_id: "cat-1",
        subcategory_id: "sub-2",
      }),
    );
  });

  it("imports unique rows successfully with zero rejects", async () => {
    createProductWithGeneratedSkuMock
      .mockResolvedValueOnce({
        data: { id: "product-1" },
        error: null,
        status: 201,
      })
      .mockResolvedValueOnce({
        data: { id: "product-2" },
        error: null,
        status: 201,
      });

    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: [
            "name,category_name,subcategory_name,barcode,unit,is_active,description",
            "Paracetamol,Hair,Shampoo,8901000000011,box,true,Tablet",
            "Vitamin C,Hair,Conditioner,8901000000012,box,true,Effervescent",
          ].join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: 2,
      rejected_count: 0,
      processed_count: 2,
      rejected_rows: [],
      max_rows: 500,
      max_products: 10000,
      current_count: 5,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(2);
  });
});
