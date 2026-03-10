import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClientMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { getAuthContext } from "@/lib/auth/permissions";

describe("getAuthContext", () => {
  beforeEach(() => {
    createServerSupabaseClientMock.mockReset();
  });

  it("falls back when profiles.master_permissions is not available yet", async () => {
    const profilesSelectMock = vi.fn((selection: string) => {
      if (selection.includes("master_permissions")) {
        return {
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: "PGRST204",
                message:
                  "Could not find the 'master_permissions' column of 'profiles' in the schema cache",
              },
            }),
          })),
        };
      }

      return {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "user-1",
              full_name: "Legacy User",
              role: "manager",
              is_active: true,
              created_at: "2026-03-10T00:00:00.000Z",
              updated_at: "2026-03-10T00:00:00.000Z",
            },
            error: null,
          }),
        })),
      };
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "legacy@example.com" } },
          error: null,
        }),
        signOut: vi.fn(),
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: profilesSelectMock,
          };
        }

        if (table === "user_location_access") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [{ location_id: "loc-1" }],
                error: null,
              }),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const result = await getAuthContext();

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) {
      throw new Error("Expected auth context, received response");
    }

    expect(result.profile.master_permissions.suppliers.create).toBe(false);
    expect(result.locationIds).toEqual(["loc-1"]);
    expect(result.profile.full_name).toBe("Legacy User");
    expect(profilesSelectMock).toHaveBeenCalledTimes(2);
  });
});
