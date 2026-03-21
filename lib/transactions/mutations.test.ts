import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertLocationAccessMock,
  ensureMainWarehouseForContextMock,
} = vi.hoisted(() => ({
  assertLocationAccessMock: vi.fn(),
  ensureMainWarehouseForContextMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );

  return {
    ...actual,
    assertLocationAccess: assertLocationAccessMock,
  };
});

vi.mock("@/lib/locations/main-warehouse", () => ({
  ensureMainWarehouseForContext: ensureMainWarehouseForContextMock,
}));

import {
  createInventoryTransaction,
  deleteInventoryTransaction,
  postInventoryTransaction,
  unpostInventoryTransaction,
  updateInventoryTransaction,
} from "@/lib/transactions/mutations";

type RpcResponse = {
  data: unknown;
  error: { message: string } | null;
};

function buildContext({
  currencyCode = "KWD",
  supplier = {
    id: "11111111-1111-1111-1111-111111111111",
    code: "0001",
    name: "Beauty Supplier",
    is_active: true,
  },
  products = [
    {
      id: "22222222-2222-2222-2222-222222222222",
      sku: "SKU-100",
      name: "Shampoo",
      barcode: "123456789",
    },
  ],
  transaction = null as {
    id: string;
    type?: string;
    status: string;
    source_location_id: string | null;
    destination_location_id: string | null;
  } | null,
  rpcResponses = {} as Record<string, RpcResponse>,
} = {}) {
  const rpcMock = vi.fn(async (name: string) => rpcResponses[name] ?? { data: null, error: null });

  return {
    context: {
      user: { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: {},
      supabase: {
        from(table: string) {
          if (table === "suppliers") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: supplier, error: null }),
                }),
              }),
            };
          }

          if (table === "products") {
            return {
              select: () => ({
                in: async () => ({ data: products, error: null }),
              }),
            };
          }

          if (table === "system_settings") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { value_text: currencyCode },
                    error: null,
                  }),
                }),
              }),
            };
          }

          if (table === "inventory_transactions") {
            return {
              select: () => ({
                eq: () => ({
                  single: async () =>
                    transaction
                      ? { data: transaction, error: null }
                      : { data: null, error: { message: "Transaction not found." } },
                }),
              }),
            };
          }

          throw new Error(`Unexpected table '${table}'.`);
        },
        rpc: rpcMock,
      },
    },
    rpcMock,
  };
}

describe("inventory transaction mutations", () => {
  beforeEach(() => {
    assertLocationAccessMock.mockReset();
    ensureMainWarehouseForContextMock.mockReset();

    assertLocationAccessMock.mockReturnValue(null);
    ensureMainWarehouseForContextMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: "33333333-3333-3333-3333-333333333333",
        code: "MWH-01",
        name: "Main Warehouse",
        timezone: "Asia/Kuwait",
        is_active: true,
      },
    });
  });

  it("creates a draft through rpc_save_inventory_draft with snapshots", async () => {
    const { context, rpcMock } = buildContext({
      rpcResponses: {
        rpc_save_inventory_draft: {
          data: {
            id: "44444444-4444-4444-4444-444444444444",
            tx_number: "TX-1",
            type: "RECEIPT",
            status: "DRAFT",
          },
          error: null,
        },
      },
    });

    const result = await createInventoryTransaction(context as never, {
      type: "RECEIPT",
      source_location_id: null,
      destination_location_id: null,
      supplier_id: "11111111-1111-1111-1111-111111111111",
      supplier_invoice_number: " INV-1001 ",
      supplier_invoice_date: "2026-03-21",
      notes: "test",
      lines: [
        {
          product_id: "22222222-2222-2222-2222-222222222222",
          qty: 2,
          unit_cost: 10,
          lot_number: "LOT-1",
          expiry_date: "2027-03-21",
          reason_code: "AUTO",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected success.");
    }

    expect(rpcMock).toHaveBeenCalledWith(
      "rpc_save_inventory_draft",
      expect.objectContaining({
        p_transaction_id: null,
        p_transaction: expect.objectContaining({
          type: "RECEIPT",
          destination_location_id: "33333333-3333-3333-3333-333333333333",
          supplier_code_snapshot: "0001",
          supplier_name_snapshot: "Beauty Supplier",
          supplier_invoice_number: "INV-1001",
        }),
        p_lines: [
          expect.objectContaining({
            product_id: "22222222-2222-2222-2222-222222222222",
            unit_cost: 10,
            product_sku_snapshot: "SKU-100",
            product_name_snapshot: "Shampoo",
            product_barcode_snapshot: "123456789",
          }),
        ],
      }),
    );
  });

  it("updates a draft through rpc_save_inventory_draft", async () => {
    const { context, rpcMock } = buildContext({
      transaction: {
        id: "44444444-4444-4444-4444-444444444444",
        type: "RECEIPT",
        status: "DRAFT",
        source_location_id: null,
        destination_location_id: "33333333-3333-3333-3333-333333333333",
      },
      rpcResponses: {
        rpc_save_inventory_draft: {
          data: {
            id: "44444444-4444-4444-4444-444444444444",
            tx_number: "TX-1",
            type: "RECEIPT",
            status: "DRAFT",
          },
          error: null,
        },
      },
    });

    const result = await updateInventoryTransaction(
      context as never,
      "44444444-4444-4444-4444-444444444444",
      {
        type: "RECEIPT",
        source_location_id: null,
        destination_location_id: null,
        supplier_id: "11111111-1111-1111-1111-111111111111",
        supplier_invoice_number: "INV-1002",
        supplier_invoice_date: "2026-03-21",
        notes: "updated",
        lines: [
          {
            product_id: "22222222-2222-2222-2222-222222222222",
            qty: 3,
            unit_cost: 12,
            lot_number: "LOT-2",
            expiry_date: "2027-03-21",
            reason_code: "AUTO",
          },
        ],
      },
    );

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "rpc_save_inventory_draft",
      expect.objectContaining({
        p_transaction_id: "44444444-4444-4444-4444-444444444444",
        p_lines: [expect.objectContaining({ unit_cost: 12 })],
      }),
    );
  });

  it("normalizes unit cost to the active currency precision before saving", async () => {
    const { context, rpcMock } = buildContext({
      currencyCode: "KWD",
      rpcResponses: {
        rpc_save_inventory_draft: {
          data: {
            id: "44444444-4444-4444-4444-444444444444",
            tx_number: "TX-1",
            type: "RECEIPT",
            status: "DRAFT",
          },
          error: null,
        },
      },
    });

    const result = await createInventoryTransaction(context as never, {
      type: "RECEIPT",
      source_location_id: null,
      destination_location_id: null,
      supplier_id: "11111111-1111-1111-1111-111111111111",
      supplier_invoice_number: "INV-1005",
      supplier_invoice_date: "2026-03-21",
      notes: "test",
      lines: [
        {
          product_id: "22222222-2222-2222-2222-222222222222",
          qty: 2,
          unit_cost: 0.0014,
          lot_number: "LOT-1",
          expiry_date: "2027-03-21",
          reason_code: "AUTO",
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "rpc_save_inventory_draft",
      expect.objectContaining({
        p_lines: [expect.objectContaining({ unit_cost: 0.001 })],
      }),
    );
  });

  it("retries create without snapshot fields when the rpc schema is behind", async () => {
    const { context, rpcMock } = buildContext({
      rpcResponses: {
        rpc_save_inventory_draft: {
          data: {
            id: "44444444-4444-4444-4444-444444444444",
            tx_number: "TX-1",
            type: "RECEIPT",
            status: "DRAFT",
          },
          error: null,
        },
      },
    });

    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'column "supplier_code_snapshot" of relation "inventory_transactions" does not exist',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "44444444-4444-4444-4444-444444444444",
          tx_number: "TX-1",
          type: "RECEIPT",
          status: "DRAFT",
        },
        error: null,
      });

    const result = await createInventoryTransaction(context as never, {
      type: "RECEIPT",
      source_location_id: null,
      destination_location_id: null,
      supplier_id: "11111111-1111-1111-1111-111111111111",
      supplier_invoice_number: "INV-1003",
      supplier_invoice_date: "2026-03-21",
      notes: "test",
      lines: [
        {
          product_id: "22222222-2222-2222-2222-222222222222",
          qty: 2,
          unit_cost: 10,
          lot_number: "LOT-1",
          expiry_date: "2027-03-21",
          reason_code: "AUTO",
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      "rpc_save_inventory_draft",
      expect.objectContaining({
        p_transaction: expect.objectContaining({
          supplier_code_snapshot: "0001",
          supplier_name_snapshot: "Beauty Supplier",
        }),
        p_lines: [
          expect.objectContaining({
            product_sku_snapshot: "SKU-100",
            product_name_snapshot: "Shampoo",
            product_barcode_snapshot: "123456789",
          }),
        ],
      }),
    );
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      "rpc_save_inventory_draft",
      expect.objectContaining({
        p_transaction: expect.not.objectContaining({
          supplier_code_snapshot: expect.anything(),
          supplier_name_snapshot: expect.anything(),
        }),
        p_lines: [
          expect.not.objectContaining({
            product_sku_snapshot: expect.anything(),
            product_name_snapshot: expect.anything(),
            product_barcode_snapshot: expect.anything(),
          }),
        ],
      }),
    );
  });

  it("retries update without snapshot fields when the rpc schema is behind", async () => {
    const { context, rpcMock } = buildContext({
      transaction: {
        id: "44444444-4444-4444-4444-444444444444",
        type: "RECEIPT",
        status: "DRAFT",
        source_location_id: null,
        destination_location_id: "33333333-3333-3333-3333-333333333333",
      },
      rpcResponses: {
        rpc_save_inventory_draft: {
          data: {
            id: "44444444-4444-4444-4444-444444444444",
            tx_number: "TX-1",
            type: "RECEIPT",
            status: "DRAFT",
          },
          error: null,
        },
      },
    });

    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'column "supplier_name_snapshot" of relation "inventory_transactions" does not exist',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "44444444-4444-4444-4444-444444444444",
          tx_number: "TX-1",
          type: "RECEIPT",
          status: "DRAFT",
        },
        error: null,
      });

    const result = await updateInventoryTransaction(
      context as never,
      "44444444-4444-4444-4444-444444444444",
      {
        type: "RECEIPT",
        source_location_id: null,
        destination_location_id: null,
        supplier_id: "11111111-1111-1111-1111-111111111111",
        supplier_invoice_number: "INV-1004",
        supplier_invoice_date: "2026-03-21",
        notes: "updated",
        lines: [
          {
            product_id: "22222222-2222-2222-2222-222222222222",
            qty: 3,
            unit_cost: 12,
            lot_number: "LOT-2",
            expiry_date: "2027-03-21",
            reason_code: "AUTO",
          },
        ],
      },
    );

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      "rpc_save_inventory_draft",
      expect.objectContaining({
        p_transaction_id: "44444444-4444-4444-4444-444444444444",
        p_transaction: expect.not.objectContaining({
          supplier_code_snapshot: expect.anything(),
          supplier_name_snapshot: expect.anything(),
        }),
        p_lines: [
          expect.not.objectContaining({
            product_sku_snapshot: expect.anything(),
            product_name_snapshot: expect.anything(),
            product_barcode_snapshot: expect.anything(),
          }),
        ],
      }),
    );
  });

  it("deletes a draft through rpc_delete_inventory_draft", async () => {
    const { context, rpcMock } = buildContext({
      transaction: {
        id: "44444444-4444-4444-4444-444444444444",
        status: "DRAFT",
        source_location_id: null,
        destination_location_id: "33333333-3333-3333-3333-333333333333",
      },
      rpcResponses: {
        rpc_delete_inventory_draft: {
          data: { success: true },
          error: null,
        },
      },
    });

    const result = await deleteInventoryTransaction(
      context as never,
      "44444444-4444-4444-4444-444444444444",
    );

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("rpc_delete_inventory_draft", {
      p_transaction_id: "44444444-4444-4444-4444-444444444444",
    });
  });

  it("finalizes a draft through rpc_finalize_inventory_transaction", async () => {
    const { context, rpcMock } = buildContext({
      transaction: {
        id: "44444444-4444-4444-4444-444444444444",
        status: "DRAFT",
        source_location_id: null,
        destination_location_id: "33333333-3333-3333-3333-333333333333",
      },
      rpcResponses: {
        rpc_finalize_inventory_transaction: {
          data: { transaction_id: "44444444-4444-4444-4444-444444444444", status: "POSTED" },
          error: null,
        },
      },
    });

    const result = await postInventoryTransaction(
      context as never,
      "44444444-4444-4444-4444-444444444444",
    );

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("rpc_finalize_inventory_transaction", {
      p_transaction_id: "44444444-4444-4444-4444-444444444444",
    });
  });

  it("reopens a posted transaction through rpc_unpost_transaction", async () => {
    const { context, rpcMock } = buildContext({
      transaction: {
        id: "44444444-4444-4444-4444-444444444444",
        status: "POSTED",
        source_location_id: null,
        destination_location_id: "33333333-3333-3333-3333-333333333333",
      },
      rpcResponses: {
        rpc_unpost_transaction: {
          data: { transaction_id: "44444444-4444-4444-4444-444444444444", status: "DRAFT" },
          error: null,
        },
      },
    });

    const result = await unpostInventoryTransaction(
      context as never,
      "44444444-4444-4444-4444-444444444444",
    );

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("rpc_unpost_transaction", {
      p_transaction_id: "44444444-4444-4444-4444-444444444444",
    });
  });
});
