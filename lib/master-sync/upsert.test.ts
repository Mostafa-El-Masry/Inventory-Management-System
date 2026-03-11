import { beforeEach, describe, expect, it, vi } from "vitest";

const { createProductWithGeneratedSkuMock } = vi.hoisted(() => ({
  createProductWithGeneratedSkuMock: vi.fn(),
}));

vi.mock("@/lib/products/create", () => ({
  createProductWithGeneratedSku: createProductWithGeneratedSkuMock,
}));

import { upsertMasterRows } from "@/lib/master-sync/upsert";

describe("master csv upsert", () => {
  beforeEach(() => {
    createProductWithGeneratedSkuMock.mockReset();
  });

  it("updates an existing supplier when the reimport differs only by casing", async () => {
    const updateMock = vi.fn().mockImplementation((values: Record<string, unknown>) => ({
      eq: () => ({
        select: () => ({
          single: async () => ({
            data: {
              id: "supplier-1",
              code: "SUP-01",
              name: values.name,
              phone: values.phone,
              email: values.email,
              is_active: values.is_active,
            },
            error: null,
          }),
        }),
      }),
    }));

    const supabase = {
      from: (table: string) => {
        if (table !== "suppliers") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: async () => ({
            data: [
              {
                id: "supplier-1",
                code: "SUP-01",
                name: "alpha supplier",
                phone: "12345",
                email: "sales@example.com",
                is_active: true,
              },
            ],
            error: null,
          }),
          update: updateMock,
        };
      },
    };

    const result = await upsertMasterRows(supabase, {
      entity: "suppliers",
      processed_count: 1,
      rows: [
        {
          row_number: 2,
          key: "SUP-01",
          value: {
            code: "SUP-01",
            name: "Alpha Supplier",
            phone: "12345",
            email: "sales@example.com",
            is_active: true,
          },
        },
      ],
      rejected_rows: [],
    });

    expect(result).toEqual({
      entity: "suppliers",
      processed_count: 1,
      inserted_count: 0,
      updated_count: 1,
      rejected_count: 0,
      rejected_rows: [],
    });
    expect(updateMock).toHaveBeenCalledWith({
      name: "Alpha Supplier",
      phone: "12345",
      email: "sales@example.com",
      is_active: true,
    });
  });

  it("generates a location code when the csv omits it", async () => {
    const insertMock = vi.fn().mockImplementation((values: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({
          data: {
            id: "location-2",
            code: values.code,
            name: values.name,
            timezone: values.timezone,
            is_active: values.is_active,
          },
          error: null,
        }),
      }),
    }));

    const supabase = {
      from: (table: string) => {
        if (table !== "locations") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: async () => ({
            data: [
              {
                id: "location-1",
                code: "LON-01",
                name: "London",
                timezone: "Europe/London",
                is_active: true,
              },
            ],
            error: null,
          }),
          insert: insertMock,
        };
      },
    };

    const result = await upsertMasterRows(supabase, {
      entity: "locations",
      processed_count: 1,
      rows: [
        {
          row_number: 2,
          key: "name:cairo",
          value: {
            code: null,
            name: "Cairo",
            timezone: "Africa/Cairo",
            is_active: true,
          },
        },
      ],
      rejected_rows: [],
    });

    expect(result.inserted_count).toBe(1);
    expect(result.rejected_count).toBe(0);
    expect(insertMock).toHaveBeenCalledWith({
      code: "CAI-01",
      name: "Cairo",
      timezone: "Africa/Cairo",
      is_active: true,
    });
  });

  it("creates products with a generated sku when the csv omits it and barcode is blank", async () => {
    createProductWithGeneratedSkuMock.mockResolvedValue({
      data: {
        id: "product-1",
        sku: "01-001-0001",
        name: "Hair Mask",
        barcode: null,
        description: null,
        unit: "box",
        is_active: true,
        category_id: "cat-1",
        subcategory_id: "sub-1",
      },
      error: null,
      status: 201,
    });

    const supabase = {
      rpc: vi.fn(),
      from: (table: string) => {
        if (table === "product_categories") {
          return {
            select: async () => ({
              data: [{ id: "cat-1", code: "01", name: "Hair" }],
              error: null,
            }),
          };
        }

        if (table === "product_subcategories") {
          return {
            select: async () => ({
              data: [{ id: "sub-1", category_id: "cat-1", code: "001", name: "Conditioner" }],
              error: null,
            }),
          };
        }

        if (table === "products") {
          return {
            select: async () => ({
              data: [],
              error: null,
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const result = await upsertMasterRows(supabase, {
      entity: "products",
      processed_count: 1,
      rows: [
        {
          row_number: 2,
          key: "name:hair mask",
          value: {
            sku: null,
            name: "Hair Mask",
            barcode: null,
            unit: "box",
            is_active: true,
            description: null,
            category_code: null,
            category_name: "Hair",
            subcategory_code: null,
            subcategory_name: "Conditioner",
          },
        },
      ],
      rejected_rows: [],
    });

    expect(result.inserted_count).toBe(1);
    expect(result.rejected_count).toBe(0);
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        name: "Hair Mask",
        barcode: null,
        category_id: "cat-1",
        subcategory_id: "sub-1",
      }),
    );
  });
});
