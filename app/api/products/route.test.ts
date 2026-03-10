import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  fromMock,
  updateMock,
  updateEqMock,
  updateSelectMock,
  updateSingleMock,
  createProductWithGeneratedSkuMock,
  findConflictingProductMock,
  mapProductUniqueViolationMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  updateEqMock: vi.fn(),
  updateSelectMock: vi.fn(),
  updateSingleMock: vi.fn(),
  createProductWithGeneratedSkuMock: vi.fn(),
  findConflictingProductMock: vi.fn(),
  mapProductUniqueViolationMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
  assertMasterPermission: assertRoleMock,
}));

vi.mock("@/lib/products/create", () => ({
  createProductWithGeneratedSku: createProductWithGeneratedSkuMock,
}));

vi.mock("@/lib/products/uniqueness", () => ({
  findConflictingProduct: findConflictingProductMock,
  mapProductUniqueViolation: mapProductUniqueViolationMock,
}));

import { PATCH, POST } from "@/app/api/products/route";

describe("POST /api/products", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    updateMock.mockReset();
    updateEqMock.mockReset();
    updateSelectMock.mockReset();
    updateSingleMock.mockReset();
    createProductWithGeneratedSkuMock.mockReset();
    findConflictingProductMock.mockReset();
    mapProductUniqueViolationMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin" },
      locationIds: [],
      supabase: {
        from: fromMock,
      },
    });
    assertRoleMock.mockReturnValue(null);

    updateSingleMock.mockResolvedValue({
      data: {
        id: "product-1",
        sku: "01-001-0000",
        name: "Paracetamol Plus",
        barcode: null,
        description: null,
        unit: "box",
        is_active: true,
      },
      error: null,
    });
    updateSelectMock.mockReturnValue({
      single: updateSingleMock,
    });
    updateEqMock.mockReturnValue({
      select: updateSelectMock,
    });
    updateMock.mockReturnValue({
      eq: updateEqMock,
    });

    fromMock.mockReturnValue({
      update: updateMock,
    });
    findConflictingProductMock.mockResolvedValue({
      conflict: null,
      error: null,
    });
    mapProductUniqueViolationMock.mockReturnValue(null);
  });

  it("creates product with server-generated taxonomy sku", async () => {
    createProductWithGeneratedSkuMock.mockResolvedValue({
      data: {
        id: "product-1",
        sku: "01-001-0000",
      },
      error: null,
      status: 201,
    });

    const response = await POST(
      new Request("https://app.example.com/api/products", {
        method: "POST",
        body: JSON.stringify({
          sku: "CUSTOM-123",
          name: "Paracetamol",
          barcode: null,
          description: null,
          unit: "box",
          is_active: true,
          category_id: "550e8400-e29b-41d4-a716-446655440010",
          subcategory_id: "550e8400-e29b-41d4-a716-446655440011",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createProductWithGeneratedSkuMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: "Paracetamol",
        barcode: null,
        description: null,
        unit: "box",
        is_active: true,
        category_id: "550e8400-e29b-41d4-a716-446655440010",
        subcategory_id: "550e8400-e29b-41d4-a716-446655440011",
      },
    );
  });

  it("returns 409 when product name already exists", async () => {
    findConflictingProductMock.mockResolvedValue({
      conflict: {
        type: "name",
        product: {
          id: "550e8400-e29b-41d4-a716-446655440010",
          name: "Paracetamol",
          sku: "01-001-0000",
        },
      },
      error: null,
    });

    const response = await POST(
      new Request("https://app.example.com/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: " paracetamol ",
          barcode: null,
          description: null,
          unit: "box",
          is_active: true,
          category_id: "550e8400-e29b-41d4-a716-446655440010",
          subcategory_id: "550e8400-e29b-41d4-a716-446655440011",
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Product name already exists.",
      details: {
        field: "name",
        product_id: "550e8400-e29b-41d4-a716-446655440010",
      },
    });
    expect(createProductWithGeneratedSkuMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/products", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    fromMock.mockReset();
    updateMock.mockReset();
    updateEqMock.mockReset();
    updateSelectMock.mockReset();
    updateSingleMock.mockReset();
    findConflictingProductMock.mockReset();
    mapProductUniqueViolationMock.mockReset();

    getAuthContextMock.mockResolvedValue({
      user: { id: "admin-user" },
      profile: { role: "admin" },
      locationIds: [],
      supabase: {
        from: fromMock,
      },
    });
    assertRoleMock.mockReturnValue(null);

    updateSingleMock.mockResolvedValue({
      data: {
        id: "product-1",
        sku: "01-001-0000",
        name: "Paracetamol Plus",
        barcode: null,
        description: null,
        unit: "box",
        is_active: true,
      },
      error: null,
    });
    updateSelectMock.mockReturnValue({
      single: updateSingleMock,
    });
    updateEqMock.mockReturnValue({
      select: updateSelectMock,
    });
    updateMock.mockReturnValue({
      eq: updateEqMock,
    });
    fromMock.mockReturnValue({
      update: updateMock,
    });

    findConflictingProductMock.mockResolvedValue({
      conflict: null,
      error: null,
    });
    mapProductUniqueViolationMock.mockReturnValue(null);
  });

  it("returns 409 when patching to a duplicate product name", async () => {
    findConflictingProductMock.mockResolvedValue({
      conflict: {
        type: "name",
        product: {
          id: "550e8400-e29b-41d4-a716-446655440010",
          name: "Paracetamol",
          sku: "01-001-0000",
        },
      },
      error: null,
    });

    const response = await PATCH(
      new Request("https://app.example.com/api/products", {
        method: "PATCH",
        body: JSON.stringify({
          id: "550e8400-e29b-41d4-a716-446655440011",
          name: " paracetamol ",
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Product name already exists.",
      details: {
        field: "name",
        product_id: "550e8400-e29b-41d4-a716-446655440010",
      },
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("blocks patch payloads attempting to mutate sku", async () => {
    const response = await PATCH(
      new Request("https://app.example.com/api/products", {
        method: "PATCH",
        body: JSON.stringify({
          id: "550e8400-e29b-41d4-a716-446655440011",
          sku: "99-999-9999",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updates allowed fields with normalized values", async () => {
    const response = await PATCH(
      new Request("https://app.example.com/api/products", {
        method: "PATCH",
        body: JSON.stringify({
          id: "550e8400-e29b-41d4-a716-446655440011",
          name: "  Paracetamol Plus  ",
          unit: "  box ",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      name: "Paracetamol Plus",
      unit: "box",
    });
  });
});
