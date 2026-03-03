import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  likeMock,
  insertMock,
  insertSelectMock,
  insertSingleMock,
  selectMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  likeMock: vi.fn(),
  insertMock: vi.fn(),
  insertSelectMock: vi.fn(),
  insertSingleMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

import { POST } from "@/app/api/locations/route";

describe("POST /api/locations", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    likeMock.mockReset();
    insertMock.mockReset();
    insertSelectMock.mockReset();
    insertSingleMock.mockReset();
    selectMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin" },
      locationIds: [],
      supabase: {
        from: fromMock,
      },
    });
    assertRoleMock.mockReturnValue(null);

    selectMock.mockImplementation((columns: string) => {
      if (columns === "code") {
        return {
          like: likeMock,
        };
      }

      return {
        single: insertSingleMock,
      };
    });

    insertSelectMock.mockReturnValue({
      single: insertSingleMock,
    });

    insertMock.mockReturnValue({
      select: insertSelectMock,
    });

    fromMock.mockReturnValue({
      select: selectMock,
      insert: insertMock,
    });
  });

  it("creates with generated code when code is omitted", async () => {
    likeMock.mockResolvedValue({
      data: [{ code: "SAB-01" }],
      error: null,
    });
    insertSingleMock.mockResolvedValue({
      data: {
        id: "loc-1",
        code: "SAB-02",
        name: "Sabah Al Salem",
        timezone: "Asia/Kuwait",
        is_active: true,
      },
      error: null,
    });

    const response = await POST(
      new Request("https://app.example.com/api/locations", {
        method: "POST",
        body: JSON.stringify({
          name: "Sabah Al Salem",
          timezone: "Asia/Kuwait",
          is_active: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(likeMock).toHaveBeenCalledWith("code", "SAB-%");
    expect(insertMock).toHaveBeenCalledWith({
      code: "SAB-02",
      name: "Sabah Al Salem",
      timezone: "Asia/Kuwait",
      is_active: true,
    });
  });

  it("ignores client-provided code and generates server code", async () => {
    likeMock.mockResolvedValue({
      data: [],
      error: null,
    });
    insertSingleMock.mockResolvedValue({
      data: {
        id: "loc-2",
        code: "SAB-01",
        name: "Sabah Al Salem",
        timezone: "Asia/Kuwait",
        is_active: true,
      },
      error: null,
    });

    const response = await POST(
      new Request("https://app.example.com/api/locations", {
        method: "POST",
        body: JSON.stringify({
          code: "CUSTOM-99",
          name: "Sabah Al Salem",
          timezone: "Asia/Kuwait",
          is_active: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith({
      code: "SAB-01",
      name: "Sabah Al Salem",
      timezone: "Asia/Kuwait",
      is_active: true,
    });
  });

  it("retries on unique code collision and succeeds", async () => {
    likeMock
      .mockResolvedValueOnce({
        data: [{ code: "SAB-01" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ code: "SAB-01" }, { code: "SAB-02" }],
        error: null,
      });

    insertSingleMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "loc-3",
          code: "SAB-03",
          name: "Sabah Al Salem",
          timezone: "Asia/Kuwait",
          is_active: true,
        },
        error: null,
      });

    const response = await POST(
      new Request("https://app.example.com/api/locations", {
        method: "POST",
        body: JSON.stringify({
          name: "Sabah Al Salem",
          timezone: "Asia/Kuwait",
          is_active: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(insertMock).toHaveBeenNthCalledWith(1, {
      code: "SAB-02",
      name: "Sabah Al Salem",
      timezone: "Asia/Kuwait",
      is_active: true,
    });
    expect(insertMock).toHaveBeenNthCalledWith(2, {
      code: "SAB-03",
      name: "Sabah Al Salem",
      timezone: "Asia/Kuwait",
      is_active: true,
    });
  });

  it("returns 409 when it cannot generate a unique code after retries", async () => {
    likeMock.mockResolvedValue({
      data: [],
      error: null,
    });
    insertSingleMock.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });

    const response = await POST(
      new Request("https://app.example.com/api/locations", {
        method: "POST",
        body: JSON.stringify({
          name: "Sabah Al Salem",
          timezone: "Asia/Kuwait",
          is_active: true,
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(insertMock).toHaveBeenCalledTimes(5);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to generate a unique location code.",
      details: null,
    });
  });
});
