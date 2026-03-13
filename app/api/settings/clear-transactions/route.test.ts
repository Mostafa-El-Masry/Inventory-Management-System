import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLEAR_TRANSACTIONS_CONFIRMATION } from "@/lib/settings/clear-transactions";

const { getAuthContextMock, assertRoleMock, rpcMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { POST } from "@/app/api/settings/clear-transactions/route";

describe("POST /api/settings/clear-transactions", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    rpcMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: { canManageSystemSettings: true },
      supabase: {
        rpc: rpcMock,
      },
    });

    assertRoleMock.mockReturnValue(null);
  });

  it("returns cleared counts for admin", async () => {
    rpcMock.mockResolvedValue({
      data: {
        success: true,
        counts: {
          supplier_document_payments: 2,
          supplier_documents: 1,
          stock_ledger: 8,
          inventory_transaction_lines: 5,
          transfer_lines: 2,
          transfers: 1,
          inventory_transactions: 4,
          inventory_batches: 3,
          alerts: 6,
        },
        total_rows_cleared: 32,
      },
      error: null,
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings/clear-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: CLEAR_TRANSACTIONS_CONFIRMATION,
        }),
      }),
    );

    expect(rpcMock).toHaveBeenCalledWith("rpc_clear_transaction_data");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      total_rows_cleared: 32,
      counts: {
        inventory_transactions: 4,
        alerts: 6,
      },
    });
  });

  it("rejects non-admin access", async () => {
    assertRoleMock.mockReturnValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("https://app.example.com/api/settings/clear-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: CLEAR_TRANSACTIONS_CONFIRMATION,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects missing or incorrect confirmation", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/settings/clear-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: "clear transactions",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    "cannot truncate a table referenced in a foreign key constraint",
    "DELETE requires a WHERE clause",
  ])("translates outdated database errors: %s", async (message) => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message },
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings/clear-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: CLEAR_TRANSACTIONS_CONFIRMATION,
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Clear transaction data is blocked by an outdated database function. Apply Supabase migration 026 and retry.",
    });
  });

  it("translates outdated transfer-line guard errors", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message:
          "Transfer lines can only be modified while transfer is REQUESTED.",
      },
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings/clear-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: CLEAR_TRANSACTIONS_CONFIRMATION,
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Clear transaction data is blocked by an outdated transfer-line guard. Apply Supabase migration 027 and retry.",
    });
  });
});
