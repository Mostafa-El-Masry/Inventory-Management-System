import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  getAuthContextMock,
  lineEqMock,
  lineInMock,
  lineLimitMock,
  lineMaybeSingleMock,
  lineNotMock,
  lineOrderMock,
  lineSelectMock,
  productEqMock,
  productMaybeSingleMock,
  productSelectMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAuthContextMock: vi.fn(),
  lineEqMock: vi.fn(),
  lineInMock: vi.fn(),
  lineLimitMock: vi.fn(),
  lineMaybeSingleMock: vi.fn(),
  lineNotMock: vi.fn(),
  lineOrderMock: vi.fn(),
  lineSelectMock: vi.fn(),
  productEqMock: vi.fn(),
  productMaybeSingleMock: vi.fn(),
  productSelectMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
}));

import { GET } from "@/app/api/products/[id]/purchase-defaults/route";

describe("GET /api/products/[id]/purchase-defaults", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAuthContextMock.mockReset();
    lineEqMock.mockReset();
    lineInMock.mockReset();
    lineLimitMock.mockReset();
    lineMaybeSingleMock.mockReset();
    lineNotMock.mockReset();
    lineOrderMock.mockReset();
    lineSelectMock.mockReset();
    productEqMock.mockReset();
    productMaybeSingleMock.mockReset();
    productSelectMock.mockReset();

    const lineBuilder = {
      eq: lineEqMock,
      order: lineOrderMock,
      in: lineInMock,
      not: lineNotMock,
      limit: lineLimitMock,
      maybeSingle: lineMaybeSingleMock,
    };

    lineSelectMock.mockReturnValue(lineBuilder);
    lineEqMock.mockReturnValue(lineBuilder);
    lineOrderMock.mockReturnValue(lineBuilder);
    lineInMock.mockReturnValue(lineBuilder);
    lineNotMock.mockReturnValue(lineBuilder);
    lineLimitMock.mockReturnValue(lineBuilder);

    productEqMock.mockReturnValue({
      maybeSingle: productMaybeSingleMock,
    });
    productSelectMock.mockReturnValue({
      eq: productEqMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "products") {
        return {
          select: productSelectMock,
        };
      }

      if (table === "inventory_transaction_lines") {
        return {
          select: lineSelectMock,
        };
      }

      return {
        select: vi.fn(),
      };
    });

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin", is_active: true },
      locationIds: [],
      capabilities: {},
      supabase: {
        from: fromMock,
      },
    });

    productMaybeSingleMock.mockResolvedValue({
      data: { id: "product-1" },
      error: null,
    });
  });

  it("returns the latest receipt unit cost for a product with history", async () => {
    lineMaybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: "line-history",
          unit_cost: 6.25,
          created_at: "2026-03-19T08:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "line-cost",
          unit_cost: 6.25,
          created_at: "2026-03-19T08:00:00.000Z",
        },
        error: null,
      });

    const response = await GET(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      product_id: "product-1",
      last_unit_cost: 6.25,
      last_unit_cost_at: "2026-03-19T08:00:00.000Z",
      has_history: true,
    });
  });

  it("returns null defaults when the product has no receipt history", async () => {
    lineMaybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const response = await GET(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      product_id: "product-1",
      last_unit_cost: null,
      last_unit_cost_at: null,
      has_history: false,
    });
  });

  it("filters history lookups to receipt transactions", async () => {
    lineMaybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: "line-history",
          unit_cost: 4.5,
          created_at: "2026-03-19T08:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "line-cost",
          unit_cost: 4.5,
          created_at: "2026-03-19T08:00:00.000Z",
        },
        error: null,
      });

    await GET(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(lineEqMock).toHaveBeenCalledWith("product_id", "product-1");
    expect(lineEqMock).toHaveBeenCalledWith("inventory_transactions.type", "RECEIPT");
  });

  it("scopes history lookups to accessible locations for non-admin users", async () => {
    getAuthContextMock.mockResolvedValue({
      user: { id: "staff-user" },
      profile: { role: "staff", is_active: true },
      locationIds: ["location-1", "location-2"],
      capabilities: {},
      supabase: {
        from: fromMock,
      },
    });
    lineMaybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: "line-history",
          unit_cost: 7.75,
          created_at: "2026-03-19T08:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "line-cost",
          unit_cost: 7.75,
          created_at: "2026-03-19T08:00:00.000Z",
        },
        error: null,
      });

    const response = await GET(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(response.status).toBe(200);
    expect(lineInMock).toHaveBeenCalledWith(
      "inventory_transactions.destination_location_id",
      ["location-1", "location-2"],
    );
  });

  it("passes through auth failures", async () => {
    getAuthContextMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Authentication required." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET(new Request("https://app.example.com"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(response.status).toBe(401);
  });
});
