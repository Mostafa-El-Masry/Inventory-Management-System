import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  updateUserByIdMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: fromMock,
    auth: {
      admin: {
        updateUserById: updateUserByIdMock,
      },
    },
  },
}));

import { POST } from "@/app/api/admin/users/[id]/disable/route";

describe("POST /api/admin/users/[id]/disable", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    updateUserByIdMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
    });
    assertRoleMock.mockReturnValue(null);
    updateUserByIdMock.mockResolvedValue({
      data: { user: { id: "target-user" } },
      error: null,
    });

    fromMock
      .mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "target-user", role: "staff", is_active: true },
              error: null,
            }),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: "target-user",
                  full_name: "Target User",
                  role: "staff",
                  is_active: false,
                  created_at: "2026-01-01T00:00:00Z",
                  updated_at: "2026-01-01T00:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        delete: () => ({
          eq: async () => ({
            error: null,
          }),
        }),
      }));
  });

  it("disables user profile and applies auth ban", async () => {
    const response = await POST(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "target-user" }),
    });

    expect(response.status).toBe(200);
    expect(updateUserByIdMock).toHaveBeenCalledWith("target-user", {
      ban_duration: "876000h",
    });
  });
});
