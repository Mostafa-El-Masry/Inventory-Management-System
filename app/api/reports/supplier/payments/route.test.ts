import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthContextMock,
  assertRoleMock,
  assertLocationAccessMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  assertRoleMock: vi.fn(),
  assertLocationAccessMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthContext: getAuthContextMock,
  assertRole: assertRoleMock,
  assertLocationAccess: assertLocationAccessMock,
}));

import { POST } from "@/app/api/reports/supplier/payments/route";

function buildContext({
  currencyCode = "KWD",
  document = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    document_type: "INVOICE",
    status: "OPEN",
    gross_amount: "10.005",
    location_id: "550e8400-e29b-41d4-a716-446655440001",
  },
  payments = [] as Array<{ amount: number | string }>,
  insertedPayment = {
    id: "payment-1",
    amount: 0.001,
  },
} = {}) {
  const paymentInsertSingleMock = vi
    .fn()
    .mockResolvedValue({ data: insertedPayment, error: null });
  const paymentInsertSelectMock = vi
    .fn()
    .mockReturnValue({ single: paymentInsertSingleMock });
  const paymentInsertMock = vi
    .fn()
    .mockReturnValue({ select: paymentInsertSelectMock });

  getAuthContextMock.mockResolvedValue({
    user: { id: "admin-user" },
    profile: { role: "admin", is_active: true },
    locationIds: [],
    capabilities: {},
    supabase: {
      from(table: string) {
        if (table === "system_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { value_text: currencyCode },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "supplier_documents") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: document,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "supplier_document_payments") {
          return {
            select: () => ({
              eq: async () => ({
                data: payments,
                error: null,
              }),
            }),
            insert: paymentInsertMock,
          };
        }

        throw new Error(`Unexpected table '${table}'.`);
      },
    },
  });

  return {
    paymentInsertMock,
  };
}

describe("POST /api/reports/supplier/payments", () => {
  beforeEach(() => {
    getAuthContextMock.mockReset();
    assertRoleMock.mockReset();
    assertLocationAccessMock.mockReset();

    assertRoleMock.mockReturnValue(null);
    assertLocationAccessMock.mockReturnValue(null);
  });

  it("rounds KWD payments to three decimals before insert", async () => {
    const { paymentInsertMock } = buildContext({
      payments: [{ amount: "10.004" }],
      insertedPayment: {
        id: "payment-1",
        amount: 0.001,
      },
    });

    const response = await POST(
      new Request("https://app.example.com/api/reports/supplier/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_document_id: "550e8400-e29b-41d4-a716-446655440000",
          payment_date: "2026-03-21",
          amount: 0.0014,
          note: "Partial payment",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(paymentInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_document_id: "550e8400-e29b-41d4-a716-446655440000",
        amount: 0.001,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      payment: {
        id: "payment-1",
        amount: 0.001,
      },
      pending_after: 0,
    });
  });

  it("rejects payments that exceed the rounded pending amount", async () => {
    const { paymentInsertMock } = buildContext({
      payments: [{ amount: "10.003" }],
    });

    const response = await POST(
      new Request("https://app.example.com/api/reports/supplier/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_document_id: "550e8400-e29b-41d4-a716-446655440000",
          payment_date: "2026-03-21",
          amount: 0.0026,
          note: null,
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(paymentInsertMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Payment amount exceeds invoice pending amount.",
      details: {
        pending_amount: 0.002,
      },
    });
  });
});
