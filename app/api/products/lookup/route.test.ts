import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  getAuthContextMock,
  productEqMock,
  productIlikeMock,
  productLimitMock,
  productOrMock,
  productOrderMock,
  productSelectMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAuthContextMock: vi.fn(),
  productEqMock: vi.fn(),
  productIlikeMock: vi.fn(),
  productLimitMock: vi.fn(),
  productOrMock: vi.fn(),
  productOrderMock: vi.fn(),
  productSelectMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
}));

import { GET } from "@/app/api/products/lookup/route";

describe("GET /api/products/lookup", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAuthContextMock.mockReset();
    productEqMock.mockReset();
    productIlikeMock.mockReset();
    productLimitMock.mockReset();
    productOrMock.mockReset();
    productOrderMock.mockReset();
    productSelectMock.mockReset();

    const productBuilder = {
      eq: productEqMock,
      ilike: productIlikeMock,
      or: productOrMock,
      order: productOrderMock,
      limit: productLimitMock,
    };

    productSelectMock.mockReturnValue(productBuilder);
    productEqMock.mockReturnValue(productBuilder);
    productIlikeMock.mockReturnValue(productBuilder);
    productOrMock.mockReturnValue(productBuilder);
    productOrderMock.mockReturnValue(productBuilder);
    productLimitMock.mockResolvedValue({
      data: [],
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "products") {
        return {
          select: productSelectMock,
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
  });

  it("rejects queries shorter than three characters", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/products/lookup?q=ab&field=item"),
    );

    expect(response.status).toBe(422);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("matches item-name prefixes and returns minimal lookup fields", async () => {
    productLimitMock.mockResolvedValue({
      data: [
        {
          id: "product-1",
          name: "Kerasilk Mask",
          sku: "SKU-1001",
          barcode: "1234567890",
        },
      ],
      error: null,
    });

    const response = await GET(
      new Request("https://app.example.com/api/products/lookup?q=Kera&field=item"),
    );

    expect(response.status).toBe(200);
    expect(productEqMock).toHaveBeenCalledWith("is_active", true);
    expect(productIlikeMock).toHaveBeenCalledWith("name", "Kera%");
    expect(productOrderMock).toHaveBeenNthCalledWith(1, "name", { ascending: true });
    expect(productOrderMock).toHaveBeenNthCalledWith(2, "sku", {
      ascending: true,
      nullsFirst: false,
    });
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: "product-1",
          name: "Kerasilk Mask",
          sku: "SKU-1001",
          barcode: "1234567890",
        },
      ],
    });
  });

  it("matches sku prefixes and barcode prefixes through the sku field", async () => {
    productLimitMock.mockResolvedValue({
      data: [
        {
          id: "product-2",
          name: "Blond Absolu",
          sku: "SKU-2061",
          barcode: "3474636692231",
        },
      ],
      error: null,
    });

    const response = await GET(
      new Request("https://app.example.com/api/products/lookup?q=347&field=sku"),
    );

    expect(response.status).toBe(200);
    expect(productOrMock).toHaveBeenCalledWith("sku.ilike.347%,barcode.ilike.347%");
    expect(productOrderMock).toHaveBeenNthCalledWith(1, "sku", {
      ascending: true,
      nullsFirst: false,
    });
    expect(productOrderMock).toHaveBeenNthCalledWith(2, "name", { ascending: true });
  });

  it("clamps the requested limit to the route maximum", async () => {
    await GET(
      new Request("https://app.example.com/api/products/lookup?q=Keras&field=item&limit=50"),
    );

    expect(productLimitMock).toHaveBeenCalledWith(20);
  });

  it("passes through auth failures", async () => {
    getAuthContextMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Authentication required." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET(
      new Request("https://app.example.com/api/products/lookup?q=Keras&field=item"),
    );

    expect(response.status).toBe(401);
  });
});
