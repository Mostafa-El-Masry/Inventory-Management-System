import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  parseMasterImportCsvMock,
  upsertMasterRowsMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  parseMasterImportCsvMock: vi.fn(),
  upsertMasterRowsMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
  assertMasterPermission: assertRoleMock,
}));

vi.mock("@/lib/master-sync/parse", () => ({
  MasterCsvImportError: class MasterCsvImportError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status = 422, details?: unknown) {
      super(message);
      this.status = status;
      this.details = details;
    }
  },
  parseMasterImportCsv: parseMasterImportCsvMock,
}));

vi.mock("@/lib/master-sync/upsert", () => ({
  upsertMasterRows: upsertMasterRowsMock,
}));

import { POST } from "@/app/api/master/import/route";

describe("POST /api/master/import", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    parseMasterImportCsvMock.mockReset();
    upsertMasterRowsMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      profile: { role: "admin" },
      supabase: { from: vi.fn() },
    });
    assertRoleMock.mockReturnValue(null);

    parseMasterImportCsvMock.mockReturnValue({
      entity: "locations",
      processed_count: 1,
      rows: [],
      rejected_rows: [],
    });

    upsertMasterRowsMock.mockResolvedValue({
      entity: "locations",
      processed_count: 1,
      inserted_count: 1,
      updated_count: 0,
      rejected_count: 0,
      rejected_rows: [],
    });
  });

  it("returns summary on success", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/master/import?entity=locations", {
        method: "POST",
        body: JSON.stringify({ csv: "code,name,timezone,is_active\nLOC-01,Main,Asia/Kuwait,true" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(parseMasterImportCsvMock).toHaveBeenCalled();
    expect(upsertMasterRowsMock).toHaveBeenCalled();
  });

  it("returns 422 for invalid entity", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/master/import?entity=unknown", {
        method: "POST",
        body: JSON.stringify({ csv: "x" }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid entity. Use one of: locations, products, categories, subcategories, suppliers.",
      details: null,
    });
  });
});
