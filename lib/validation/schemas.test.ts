import { describe, expect, it } from "vitest";

import {
  productCreateSchema,
  transactionCreateSchema,
  transferCreateSchema,
} from "@/lib/validation";

describe("validation schemas", () => {
  it("validates product payload", () => {
    const parsed = productCreateSchema.safeParse({
      sku: "SKU-100",
      name: "Sample Product",
      unit: "box",
      barcode: null,
      description: null,
      is_active: true,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects non-integer transaction quantity", () => {
    const parsed = transactionCreateSchema.safeParse({
      type: "RECEIPT",
      destination_location_id: "550e8400-e29b-41d4-a716-446655440000",
      lines: [
        {
          product_id: "550e8400-e29b-41d4-a716-446655440001",
          qty: 1.25,
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("requires at least one transfer line", () => {
    const parsed = transferCreateSchema.safeParse({
      from_location_id: "550e8400-e29b-41d4-a716-446655440000",
      to_location_id: "550e8400-e29b-41d4-a716-446655440001",
      lines: [],
    });

    expect(parsed.success).toBe(false);
  });
});
