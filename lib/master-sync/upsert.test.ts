import { describe, expect, it, vi } from "vitest";

import { upsertMasterRows } from "@/lib/master-sync/upsert";

describe("master csv upsert", () => {
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
});
