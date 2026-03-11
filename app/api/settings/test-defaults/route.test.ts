import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  getSettingsTestDefaultsMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  getSettingsTestDefaultsMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

vi.mock("@/lib/admin/settings-test-actions", () => ({
  getSettingsTestDefaults: getSettingsTestDefaultsMock,
}));

import { GET } from "@/app/api/settings/test-defaults/route";

describe("Settings Test Defaults API", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    getSettingsTestDefaultsMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: { canManageSystemSettings: true },
      supabase: {},
    });

    assertRoleMock.mockReturnValue(null);
  });

  it("returns one-click defaults", async () => {
    getSettingsTestDefaultsMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        transfer: {
          source_location: { id: "loc-1", code: "ABU-01", name: "Abu Dhabi" },
          destination_location: { id: "loc-2", code: "AMM-01", name: "Amman" },
          product: { id: "prod-1", sku: "SKU-0001", name: "Product 1" },
          qty: 1,
          bootstrap_required: true,
        },
        consumption: {
          location: { id: "loc-1", code: "ABU-01", name: "Abu Dhabi" },
          product: { id: "prod-1", sku: "SKU-0001", name: "Product 1" },
          qty: 1,
          bootstrap_required: true,
        },
      },
    });

    const response = await GET();

    if (!response) {
      throw new Error("Expected response.");
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      transfer: {
        qty: 1,
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

    const response = await GET();

    if (!response) {
      throw new Error("Expected response.");
    }

    expect(response.status).toBe(403);
  });
});
