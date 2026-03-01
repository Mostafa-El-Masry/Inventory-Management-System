import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  getUserMock,
  fromMock,
  updateUserMock,
  signOutMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  updateUserMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { POST } from "@/app/api/auth/set-password/route";

describe("POST /api/auth/set-password", () => {
  beforeEach(() => {
    createServerSupabaseClientMock.mockReset();
    getUserMock.mockReset();
    fromMock.mockReset();
    updateUserMock.mockReset();
    signOutMock.mockReset();

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: getUserMock,
        updateUser: updateUserMock,
        signOut: signOutMock,
      },
      from: fromMock,
    });
  });

  it("rejects weak password payloads", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({
          password: "weakpass123",
          confirm_password: "weakpass123",
        }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it("rejects mismatched confirmation payloads", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({
          password: "StrongPass123!",
          confirm_password: "StrongPass123?",
        }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it("updates password and signs out on success", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_active: true },
            error: null,
          }),
        }),
      }),
    });
    updateUserMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });

    const response = await POST(
      new Request("https://app.example.com/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({
          password: "StrongPass123!",
          confirm_password: "StrongPass123!",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateUserMock).toHaveBeenCalledWith({ password: "StrongPass123!" });
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
