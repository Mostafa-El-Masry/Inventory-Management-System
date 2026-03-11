import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  runSettingsTestActionMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  runSettingsTestActionMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

vi.mock("@/lib/admin/settings-test-actions", () => ({
  runSettingsTestAction: runSettingsTestActionMock,
}));

import { POST } from "@/app/api/settings/test-transactions/route";

describe("Settings Test Transactions API", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    runSettingsTestActionMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: { canManageSystemSettings: true },
      supabase: {},
    });

    assertRoleMock.mockReturnValue(null);
  });

  it("returns created purchase test transaction", async () => {
    runSettingsTestActionMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        success: true,
        kind: "purchase",
        record: {
          entity: "transaction",
          id: "tx-1",
          number: "TX-1",
          status: "POSTED",
          transaction_type: "RECEIPT",
        },
        steps_completed: ["purchase:create", "purchase:submit", "purchase:post"],
        bootstrap_record: null,
      },
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings/test-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "purchase",
        }),
      }),
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected response.");
    }
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      kind: "purchase",
      record: {
        number: "TX-1",
        status: "POSTED",
      },
    });
  });

  it("returns partial transfer failure with step details", async () => {
    runSettingsTestActionMock.mockResolvedValue({
      ok: true,
      status: 207,
      data: {
        success: false,
        kind: "transfer",
        record: {
          entity: "transfer",
          id: "tr-1",
          number: "TR-1",
          status: "APPROVED",
          transaction_type: null,
        },
        steps_completed: [
          "bootstrap:create",
          "bootstrap:submit",
          "bootstrap:post",
          "transfer:create",
          "transfer:approve",
        ],
        failed_step: "transfer:dispatch",
        error: "Dispatch failed.",
        bootstrap_record: {
          entity: "transaction",
          id: "tx-bootstrap",
          number: "TX-B",
          status: "POSTED",
          transaction_type: "RECEIPT",
        },
      },
    });

    const response = await POST(
      new Request("https://app.example.com/api/settings/test-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "transfer",
        }),
      }),
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected response.");
    }
    expect(response.status).toBe(207);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      failed_step: "transfer:dispatch",
      record: {
        number: "TR-1",
      },
      bootstrap_record: {
        number: "TX-B",
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
      new Request("https://app.example.com/api/settings/test-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "consumption",
        }),
      }),
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected response.");
    }
    expect(response.status).toBe(403);
  });

  it("rejects unexpected manual input payloads", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/settings/test-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "purchase",
          supplier_id: "550e8400-e29b-41d4-a716-446655440111",
        }),
      }),
    );

    if (!response) {
      throw new Error("Expected response.");
    }
    expect(response.status).toBe(422);
    expect(runSettingsTestActionMock).not.toHaveBeenCalled();
  });
});
