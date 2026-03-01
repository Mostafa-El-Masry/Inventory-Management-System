import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().date();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const locationCreateSchema = z.object({
  code: z.string().min(2).max(32),
  name: z.string().min(2).max(128),
  timezone: z.string().min(3).max(64).default("UTC"),
  is_active: z.boolean().default(true),
});

export const locationPatchSchema = locationCreateSchema.partial().extend({
  id: uuid,
});

export const productCreateSchema = z.object({
  sku: z.string().min(2).max(64),
  barcode: z.string().max(128).nullable().optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(500).nullable().optional(),
  unit: z.string().min(1).max(24).default("unit"),
  is_active: z.boolean().default(true),
});

export const productPatchSchema = productCreateSchema.partial().extend({
  id: uuid,
});

export const productPolicySchema = z.object({
  location_id: uuid,
  min_qty: z.number().int().nonnegative(),
  max_qty: z.number().int().nonnegative(),
  reorder_qty: z.number().int().nonnegative(),
});

export const transactionLineSchema = z.object({
  product_id: uuid,
  qty: z.number().int().positive(),
  unit_cost: z.number().nonnegative().nullable().optional(),
  lot_number: z.string().max(64).nullable().optional(),
  expiry_date: isoDate.nullable().optional(),
  reason_code: z.string().max(64).nullable().optional(),
});

export const transactionCreateSchema = z.object({
  type: z.enum([
    "RECEIPT",
    "ISSUE",
    "TRANSFER_OUT",
    "TRANSFER_IN",
    "ADJUSTMENT",
    "RETURN_IN",
    "RETURN_OUT",
    "CYCLE_COUNT",
    "REVERSAL",
  ]),
  source_location_id: uuid.nullable().optional(),
  destination_location_id: uuid.nullable().optional(),
  reference_type: z.string().max(64).nullable().optional(),
  reference_id: uuid.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z.array(transactionLineSchema).min(1),
});

export const transferCreateSchema = z.object({
  from_location_id: uuid,
  to_location_id: uuid,
  notes: z.string().max(500).nullable().optional(),
  lines: z
    .array(
      z.object({
        product_id: uuid,
        requested_qty: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const reverseTransactionSchema = z.object({
  reason: z.string().min(5).max(250),
});

export const alertAckSchema = z.object({
  note: z.string().max(250).nullable().optional(),
});

export const userPatchSchema = z.object({
  id: uuid,
  full_name: z.string().min(1).max(120).optional(),
  role: z.enum(["admin", "manager", "staff"]).optional(),
  is_active: z.boolean().optional(),
});

export const userCreateSchema = z
  .object({
    email: z.string().email(),
    full_name: z.string().min(1).max(120),
    role: z.enum(["admin", "manager", "staff"]),
    mode: z.enum(["invite", "password"]),
    password: z.string().min(8).max(128).optional(),
    location_ids: z.array(uuid).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "password" && !value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password is required when mode is 'password'.",
      });
    }
  });

export const userLocationAssignSchema = z.object({
  location_ids: z.array(uuid),
});

export const userStatusSchema = z.object({
  note: z.string().max(240).optional(),
});

export const archiveActionSchema = z.object({
  note: z.string().max(240).optional(),
});
