import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { GET } from "@/app/api/master/export/route";

describe("GET /api/master/export", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();

    const locationsQuery = {
      order: vi.fn().mockResolvedValue({
        data: [
          {
            code: "LOC-01",
            name: "Main",
            timezone: "Asia/Kuwait",
            is_active: true,
          },
        ],
        error: null,
      }),
    };

    const selectMock = vi.fn().mockReturnValue(locationsQuery);

    fromMock.mockImplementation((table: string) => {
      if (table === "locations") {
        return {
          select: selectMock,
        };
      }

      return {
        select: vi.fn(),
      };
    });

    getAuthContextMock.mockResolvedValue({
      profile: { role: "admin" },
      supabase: {
        from: fromMock,
      },
    });
    assertRoleMock.mockReturnValue(null);
  });

  it("exports locations csv", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/master/export?entity=locations"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    await expect(response.text()).resolves.toContain("code,name,timezone,is_active");
  });

  it("returns 422 for invalid entity", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/master/export?entity=unknown"),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid entity. Use one of: locations, products, categories, subcategories, suppliers.",
      details: null,
    });
  });
});
