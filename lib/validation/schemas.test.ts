import { describe, expect, it } from "vitest";

import {
  loginSchema,
  productCreateSchema,
  setPasswordSchema,
  transactionCreateSchema,
  transferCreateSchema,
  userCreateSchema,
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

  it("validates invite user payload", () => {
    const parsed = userCreateSchema.safeParse({
      email: "invited.user@ims.local",
      full_name: "Invited User",
      role: "staff",
      mode: "invite",
      location_ids: [],
    });

    expect(parsed.success).toBe(true);
  });

  it("requires password for password-mode provisioning", () => {
    const parsed = userCreateSchema.safeParse({
      email: "local.user@ims.local",
      full_name: "Local User",
      role: "manager",
      mode: "password",
      location_ids: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects weak password for password-mode provisioning", () => {
    const parsed = userCreateSchema.safeParse({
      email: "weak.password@ims.local",
      full_name: "Weak Password",
      role: "staff",
      mode: "password",
      password: "weakpass123",
      location_ids: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts short login password payloads", () => {
    const parsed = loginSchema.safeParse({
      email: "user@ims.local",
      password: "short1!",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects mismatched set-password confirmation", () => {
    const parsed = setPasswordSchema.safeParse({
      password: "StrongPass123!",
      confirm_password: "StrongPass123?",
    });

    expect(parsed.success).toBe(false);
  });
});
