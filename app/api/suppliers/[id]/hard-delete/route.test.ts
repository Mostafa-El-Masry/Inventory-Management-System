import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  documentCountEqMock,
  deleteEqMock,
  deleteSelectMock,
  deleteMaybeSingleMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  documentCountEqMock: vi.fn(),
  deleteEqMock: vi.fn(),
  deleteSelectMock: vi.fn(),
  deleteMaybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { POST } from "@/app/api/suppliers/[id]/hard-delete/route";

describe("POST /api/suppliers/[id]/hard-delete", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    documentCountEqMock.mockReset();
    deleteEqMock.mockReset();
    deleteSelectMock.mockReset();
    deleteMaybeSingleMock.mockReset();

    assertRoleMock.mockReturnValue(null);
    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: {},
      supabase: {
        from: fromMock,
      },
    });

    deleteMaybeSingleMock.mockResolvedValue({
      data: {
        id: "supplier-1",
        code: "SUP-01",
        name: "Main Supplier",
      },
      error: null,
    });
    deleteSelectMock.mockReturnValue({
      maybeSingle: deleteMaybeSingleMock,
    });
    deleteEqMock.mockReturnValue({
      select: deleteSelectMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "supplier_documents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: documentCountEqMock,
          }),
        };
      }
      if (table === "suppliers") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: deleteEqMock,
          }),
        };
      }
      return {
        select: vi.fn(),
      };
    });
  });

  it("returns 409 when linked supplier documents exist", async () => {
    documentCountEqMock.mockResolvedValue({
      count: 1,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "supplier-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot hard delete supplier with linked documents.",
      details: {
        field: "supplier_id",
        supplier_id: "supplier-1",
      },
    });
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("hard deletes supplier when no linked documents exist", async () => {
    documentCountEqMock.mockResolvedValue({
      count: 0,
      error: null,
    });

    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "supplier-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "supplier-1",
      code: "SUP-01",
      name: "Main Supplier",
    });
    expect(deleteEqMock).toHaveBeenCalledWith("id", "supplier-1");
  });
});
