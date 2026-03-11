import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSettingsTestDefaults,
  runSettingsTestAction,
} from "@/lib/admin/settings-test-actions";

const {
  createInventoryTransactionMock,
  submitInventoryTransactionMock,
  postInventoryTransactionMock,
  createTransferMock,
  approveTransferMock,
  dispatchTransferMock,
  receiveTransferMock,
  ensureMainWarehouseForContextMock,
} = vi.hoisted(() => ({
  createInventoryTransactionMock: vi.fn(),
  submitInventoryTransactionMock: vi.fn(),
  postInventoryTransactionMock: vi.fn(),
  createTransferMock: vi.fn(),
  approveTransferMock: vi.fn(),
  dispatchTransferMock: vi.fn(),
  receiveTransferMock: vi.fn(),
  ensureMainWarehouseForContextMock: vi.fn(),
}));

vi.mock("@/lib/transactions/mutations", () => ({
  createInventoryTransaction: createInventoryTransactionMock,
  submitInventoryTransaction: submitInventoryTransactionMock,
  postInventoryTransaction: postInventoryTransactionMock,
}));

vi.mock("@/lib/transfers/mutations", () => ({
  createTransfer: createTransferMock,
  approveTransfer: approveTransferMock,
  dispatchTransfer: dispatchTransferMock,
  receiveTransfer: receiveTransferMock,
}));

vi.mock("@/lib/locations/main-warehouse", () => ({
  MAIN_WAREHOUSE_CODE: "MWH-01",
  MAIN_WAREHOUSE_NAME: "Main Warehouse",
  ensureMainWarehouseForContext: ensureMainWarehouseForContextMock,
  isMainWarehouseLocation: (location: { code?: string | null; name?: string | null } | null | undefined) =>
    Boolean(
      location &&
        ((location.code ?? "").trim().toUpperCase() === "MWH-01" ||
          (location.name ?? "").trim().toUpperCase() === "MAIN WAREHOUSE"),
    ),
}));

function buildQueryResult(data: unknown) {
  return Promise.resolve({ data, error: null });
}

function createContext(stockRows: Array<{ product_id: string; location_id: string; qty_on_hand: number }> = []) {
  return {
    user: { id: "admin-user" },
    profile: { role: "admin", is_active: true },
    locationIds: [],
    capabilities: { canManageSystemSettings: true },
    supabase: {
      from(table: string) {
        if (table === "products") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () =>
                    buildQueryResult([
                      { id: "prod-2", sku: "SKU-0002", name: "Product 2" },
                      { id: "prod-1", sku: "SKU-0001", name: "Product 1" },
                    ]),
                }),
              }),
            }),
          };
        }

        if (table === "locations") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () =>
                    buildQueryResult([
                      { id: "loc-2", code: "AMM-01", name: "Amman" },
                      { id: "loc-1", code: "ABU-01", name: "Abu Dhabi" },
                    ]),
                }),
              }),
            }),
          };
        }

        if (table === "suppliers") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () =>
                    buildQueryResult([
                      { id: "sup-2", code: "0002", name: "Supplier 2" },
                      { id: "sup-1", code: "0001", name: "Supplier 1" },
                    ]),
                }),
              }),
            }),
          };
        }

        if (table === "inventory_batches") {
          return {
            select: () => ({
              gt: () => buildQueryResult(stockRows),
            }),
          };
        }

        throw new Error(`Unexpected table '${table}'.`);
      },
    },
  };
}

describe("settings test defaults", () => {
  it("builds one-click defaults and bootstrap hints", async () => {
    ensureMainWarehouseForContextMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: "loc-0",
        code: "MWH-01",
        name: "Main Warehouse",
        timezone: "Asia/Kuwait",
        is_active: true,
      },
    });

    const result = await getSettingsTestDefaults(createContext() as never);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected defaults.");
    }

    expect(result.data.transfer.bootstrap_required).toBe(true);
    expect(result.data.consumption.bootstrap_required).toBe(true);
  });
});

describe("runSettingsTestAction", () => {
  beforeEach(() => {
    createInventoryTransactionMock.mockReset();
    submitInventoryTransactionMock.mockReset();
    postInventoryTransactionMock.mockReset();
    createTransferMock.mockReset();
    approveTransferMock.mockReset();
    dispatchTransferMock.mockReset();
    receiveTransferMock.mockReset();

    let txCounter = 0;
    createInventoryTransactionMock.mockImplementation(async (context, payload) => {
      txCounter += 1;
      return {
        ok: true,
        status: 201,
        data: {
          id: `tx-${txCounter}`,
          tx_number: `TX-${txCounter}`,
          status: "DRAFT",
          type: payload.type,
        },
      };
    });
    submitInventoryTransactionMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: "SUBMITTED" },
    });
    postInventoryTransactionMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true },
    });
    createTransferMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        id: "tr-1",
        transfer_number: "TR-1",
        status: "REQUESTED",
      },
    });
    approveTransferMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: "APPROVED" },
    });
    dispatchTransferMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true },
    });
    receiveTransferMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true },
    });
    ensureMainWarehouseForContextMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: "loc-0",
        code: "MWH-01",
        name: "Main Warehouse",
        timezone: "Asia/Kuwait",
        is_active: true,
      },
    });
  });

  it("creates a purchase receipt from randomized defaults", async () => {
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.34);

    const result = await runSettingsTestAction(createContext() as never, {
      kind: "purchase",
    });

    randomSpy.mockRestore();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected success.");
    }

    expect(result.data.success).toBe(true);
    expect(createInventoryTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "RECEIPT",
        supplier_id: "sup-2",
        destination_location_id: "loc-0",
        lines: [
          expect.objectContaining({
            product_id: "prod-2",
            qty: 4,
            unit_cost: 20.3,
          }),
        ],
      }),
    );
  });

  it("bootstraps stock before completing transfer test on an empty system", async () => {
    const result = await runSettingsTestAction(createContext() as never, {
      kind: "transfer",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected success.");
    }

    expect(result.data.success).toBe(true);
    expect(createInventoryTransactionMock).toHaveBeenCalledTimes(1);
    expect(createTransferMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        from_location_id: "loc-0",
        to_location_id: "loc-1",
        lines: [
          expect.objectContaining({
            product_id: "prod-1",
            requested_qty: 1,
          }),
        ],
      }),
    );
    expect(result.data.bootstrap_record?.number).toBe("TX-1");
    expect(result.data.steps_completed).toEqual([
      "bootstrap:create",
      "bootstrap:submit",
      "bootstrap:post",
      "transfer:create",
      "transfer:approve",
      "transfer:dispatch",
      "transfer:receive",
    ]);
  });

  it("bootstraps stock before posting consumption on an empty system", async () => {
    const result = await runSettingsTestAction(createContext() as never, {
      kind: "consumption",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected success.");
    }

    expect(result.data.success).toBe(true);
    expect(createInventoryTransactionMock).toHaveBeenCalledTimes(2);
    expect(createInventoryTransactionMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        type: "CONSUMPTION",
        source_location_id: "loc-0",
        lines: [
          expect.objectContaining({
            product_id: "prod-1",
            qty: 1,
          }),
        ],
      }),
    );
    expect(result.data.bootstrap_record?.number).toBe("TX-1");
    expect(result.data.record.transaction_type).toBe("CONSUMPTION");
  });

  it("translates the transfer guard failure into a migration hint", async () => {
    dispatchTransferMock.mockResolvedValue({
      ok: false,
      status: 400,
      error: "Transfer lines can only be modified while transfer is REQUESTED.",
    });

    const result = await runSettingsTestAction(createContext() as never, {
      kind: "transfer",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected partial success.");
    }

    expect(result.status).toBe(207);
    expect(result.data.error).toContain("migration 023");
  });

  it("translates the consumption constraint failure into a migration hint", async () => {
    createInventoryTransactionMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 400,
      error:
        'new row for relation "inventory_transactions" violates check constraint "inventory_transactions_check"',
    }));

    const result = await runSettingsTestAction(createContext() as never, {
      kind: "consumption",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected failure.");
    }

    expect(result.error).toContain("migration 023");
  });
});
