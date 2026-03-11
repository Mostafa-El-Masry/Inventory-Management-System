import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  insertMock,
  insertSelectMock,
  insertSingleMock,
  createProductWithGeneratedSkuMock,
  productsCountSelectMock,
  productsCatalogSelectMock,
  categoriesSelectMock,
  subcategoriesSelectMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  insertSelectMock: vi.fn(),
  insertSingleMock: vi.fn(),
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
import { PRODUCT_IMPORT_BATCH_SIZE } from "@/lib/products/import";

describe("POST /api/products/import", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    insertMock.mockReset();
    insertSelectMock.mockReset();
    insertSingleMock.mockReset();
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
    insertSingleMock.mockImplementation(async () => {
      const values = insertMock.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      return {
        data: values
          ? {
              id: "product-imported",
              ...values,
            }
          : null,
        error: null,
      };
    });
    insertSelectMock.mockReturnValue({
      single: insertSingleMock,
    });
    insertMock.mockReturnValue({
      select: insertSelectMock,
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
            if (columns === "id, sku, name, barcode") {
              return productsCatalogSelectMock();
            }
            return Promise.resolve({
              data: [],
              error: null,
            });
          },
          insert: insertMock,
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
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
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
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
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

  it("skips invalid csv rows and continues importing valid rows", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: [
            "name,category_name,subcategory_name,barcode,unit,is_active,description",
            "A,Hair,Shampoo,8901000000011,box,true,Too short name",
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
          name: "A",
          barcode: "8901000000011",
          reason: 'Column "name": wrong entry. Must be at least 2 characters.',
        },
      ],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
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

  it("imports rows with missing taxonomy or unit by using null taxonomy and default unit", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: [
            "name,category_name,subcategory_name,barcode,unit,is_active,description",
            "Paracetamol,Hair,,8901000000011,,true,Tablet",
          ].join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: 1,
      rejected_count: 0,
      processed_count: 1,
      rejected_rows: [],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 4,
    });
    expect(createProductWithGeneratedSkuMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: expect.stringMatching(/^SKU-\d+$/),
        name: "Paracetamol",
        barcode: "8901000000011",
        unit: "unit",
        category_id: null,
        subcategory_id: null,
      }),
    );
  });

  it("skips existing-name conflicts and still imports other valid rows", async () => {
    productsCatalogSelectMock.mockResolvedValue({
      data: [
        {
          id: "product-existing",
          sku: "SKU-1001",
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
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
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
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 5,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(2);
  });

  it("imports valid rows across multiple internal batches", async () => {
    const csvLines = ["name,category_name,subcategory_name,barcode,unit,is_active,description"];

    for (let index = 0; index < PRODUCT_IMPORT_BATCH_SIZE + 1; index += 1) {
      csvLines.push(
        [
          `Product ${index}`,
          "Hair",
          "Shampoo",
          `8901${String(index).padStart(9, "0")}`,
          "box",
          "true",
          "",
        ].join(","),
      );
    }

    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: csvLines.join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: PRODUCT_IMPORT_BATCH_SIZE + 1,
      rejected_count: 0,
      processed_count: PRODUCT_IMPORT_BATCH_SIZE + 1,
      rejected_rows: [],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 3 + PRODUCT_IMPORT_BATCH_SIZE + 1,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(
      PRODUCT_IMPORT_BATCH_SIZE + 1,
    );
  });

  it("rejects duplicate names across internal batches", async () => {
    const csvLines = ["name,category_name,subcategory_name,barcode,unit,is_active,description"];

    for (let index = 0; index < PRODUCT_IMPORT_BATCH_SIZE; index += 1) {
      csvLines.push(
        [
          `Product ${index}`,
          "Hair",
          "Shampoo",
          `8911${String(index).padStart(9, "0")}`,
          "box",
          "true",
          "",
        ].join(","),
      );
    }

    csvLines.push("Product 0,Hair,Conditioner,8999999999999,box,true,");

    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: csvLines.join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: PRODUCT_IMPORT_BATCH_SIZE,
      rejected_count: 1,
      processed_count: PRODUCT_IMPORT_BATCH_SIZE + 1,
      rejected_rows: [
        {
          row_number: PRODUCT_IMPORT_BATCH_SIZE + 2,
          name: "Product 0",
          barcode: "8999999999999",
          reason: "Duplicate name in CSV.",
          first_row_number: 2,
        },
      ],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 3 + PRODUCT_IMPORT_BATCH_SIZE,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(
      PRODUCT_IMPORT_BATCH_SIZE,
    );
  });

  it("rejects duplicate barcodes across internal batches", async () => {
    const csvLines = ["name,category_name,subcategory_name,barcode,unit,is_active,description"];

    for (let index = 0; index < PRODUCT_IMPORT_BATCH_SIZE; index += 1) {
      csvLines.push(
        [
          `Product ${index}`,
          "Hair",
          "Shampoo",
          `8921${String(index).padStart(9, "0")}`,
          "box",
          "true",
          "",
        ].join(","),
      );
    }

    csvLines.push(`Late Product,Hair,Conditioner,${`8921${String(0).padStart(9, "0")}`},box,true,`);

    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: csvLines.join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: PRODUCT_IMPORT_BATCH_SIZE,
      rejected_count: 1,
      processed_count: PRODUCT_IMPORT_BATCH_SIZE + 1,
      rejected_rows: [
        {
          row_number: PRODUCT_IMPORT_BATCH_SIZE + 2,
          name: "Late Product",
          barcode: `8921${String(0).padStart(9, "0")}`,
          reason: "Duplicate barcode in CSV.",
          first_row_number: 2,
        },
      ],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 3 + PRODUCT_IMPORT_BATCH_SIZE,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(
      PRODUCT_IMPORT_BATCH_SIZE,
    );
  });

  it("skips existing-name conflicts in later batches and still imports other valid rows", async () => {
    productsCatalogSelectMock.mockResolvedValue({
      data: [
        {
          id: "product-existing",
          sku: "SKU-1001",
          name: "Catalog Product",
          barcode: "8901000000099",
        },
      ],
      error: null,
    });

    const csvLines = ["name,category_name,subcategory_name,barcode,unit,is_active,description"];

    for (let index = 0; index < PRODUCT_IMPORT_BATCH_SIZE; index += 1) {
      csvLines.push(
        [
          `Product ${index}`,
          "Hair",
          "Shampoo",
          `8931${String(index).padStart(9, "0")}`,
          "box",
          "true",
          "",
        ].join(","),
      );
    }

    csvLines.push("Catalog Product,Hair,Conditioner,8931999999999,box,true,");

    const response = await POST(
      new Request("https://app.example.com/api/products/import", {
        method: "POST",
        body: JSON.stringify({
          csv: csvLines.join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: PRODUCT_IMPORT_BATCH_SIZE,
      rejected_count: 1,
      processed_count: PRODUCT_IMPORT_BATCH_SIZE + 1,
      rejected_rows: [
        {
          row_number: PRODUCT_IMPORT_BATCH_SIZE + 2,
          name: "Catalog Product",
          barcode: "8931999999999",
          reason: "Name already exists in catalog.",
          existing_product_id: "product-existing",
        },
      ],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 3 + PRODUCT_IMPORT_BATCH_SIZE,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(
      PRODUCT_IMPORT_BATCH_SIZE,
    );
  });

  it("continues importing after a generated SKU conflict", async () => {
    createProductWithGeneratedSkuMock
      .mockResolvedValueOnce({
        data: { id: "product-1" },
        error: null,
        status: 201,
      })
      .mockResolvedValueOnce({
        data: null,
        error: "Product SKU already exists.",
        status: 409,
      })
      .mockResolvedValueOnce({
        data: { id: "product-3" },
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
            "Magnesium,Skin,Cream,8901000000013,box,true,Supplement",
          ].join("\n"),
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      inserted_count: 2,
      rejected_count: 1,
      processed_count: 3,
      rejected_rows: [
        {
          row_number: 3,
          name: "Vitamin C",
          barcode: "8901000000012",
          reason: "Product SKU already exists.",
        },
      ],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 5,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(3);
  });

  it("rejects remaining rows when the max total product count is reached mid-import", async () => {
    productsCountSelectMock.mockResolvedValue({
      count: 9999,
      error: null,
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
      inserted_count: 1,
      rejected_count: 1,
      processed_count: 2,
      rejected_rows: [
        {
          row_number: 3,
          name: "Vitamin C",
          barcode: "8901000000012",
          reason: "Max total products (10000) reached.",
        },
      ],
      batch_size: PRODUCT_IMPORT_BATCH_SIZE,
      max_products: 10000,
      current_count: 10000,
    });
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledTimes(1);
  });
});
