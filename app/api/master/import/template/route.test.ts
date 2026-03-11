import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
  assertMasterPermission: assertRoleMock,
}));

import { GET } from "@/app/api/master/import/template/route";

describe("GET /api/master/import/template", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      profile: { role: "admin" },
    });
    assertRoleMock.mockReturnValue(null);
  });

  it("returns headers for requested entity", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/master/import/template?entity=locations"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    await expect(response.text()).resolves.toBe("name,timezone,is_active\n");
  });

  it("returns 422 for unsupported entity", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/master/import/template?entity=unknown"),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid entity. Use one of: locations, products, categories, subcategories, suppliers.",
      details: null,
    });
  });
});
