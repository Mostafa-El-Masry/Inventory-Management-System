import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().date();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

// Enhanced password validation: min 12 chars, requires uppercase, lowercase, number, and symbol
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must not exceed 128 characters")
  .refine(
    (pwd) => /[A-Z]/.test(pwd),
    "Password must contain at least one uppercase letter",
  )
  .refine(
    (pwd) => /[a-z]/.test(pwd),
    "Password must contain at least one lowercase letter",
  )
  .refine(
    (pwd) => /[0-9]/.test(pwd),
    "Password must contain at least one number",
  )
  .refine(
    (pwd) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
    "Password must contain at least one special character",
  );

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm_password: z.string().min(1).max(128),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirm_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "Passwords do not match.",
      });
    }
  });

export const locationCreateSchema = z.object({
  code: z.string().min(2).max(32).optional(),
  name: z.string().min(2).max(128),
  timezone: z.string().min(3).max(64).default("UTC"),
  is_active: z.boolean().default(true),
});

export const locationPatchSchema = locationCreateSchema.partial().extend({
  id: uuid,
});

export const productCreateSchema = z.object({
  sku: z.string().min(2).max(64).optional(),
  barcode: z.string().max(128).nullable().optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(500).nullable().optional(),
  unit: z.string().min(1).max(24).default("unit"),
  is_active: z.boolean().default(true),
  category_id: uuid,
  subcategory_id: uuid,
});

export const productPatchSchema = z
  .object({
    barcode: z.string().max(128).nullable().optional(),
    name: z.string().min(2).max(160).optional(),
    description: z.string().max(500).nullable().optional(),
    unit: z.string().min(1).max(24).optional(),
    is_active: z.boolean().optional(),
  })
  .extend({
    id: uuid,
  })
  .strict();

export const productImportSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
});

export const masterImportSchema = z.object({
  csv: z.string().min(1).max(10_000_000),
});

export const productCategoryCreateSchema = z.object({
  name: z.string().min(2).max(120),
  is_active: z.boolean().default(true),
});

export const productSubcategoryCreateSchema = z.object({
  category_id: uuid,
  name: z.string().min(2).max(120),
  is_active: z.boolean().default(true),
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
  supplier_id: uuid.nullable().optional(),
  supplier_invoice_number: z.string().max(120).nullable().optional(),
  supplier_invoice_date: isoDate.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z.array(transactionLineSchema).min(1),
}).superRefine((value, ctx) => {
  const needsSupplier = value.type === "RECEIPT" || value.type === "RETURN_OUT";
  if (!needsSupplier) {
    return;
  }

  if (!value.supplier_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["supplier_id"],
      message: "Supplier is required for purchase and purchase return.",
    });
  }

  const invoiceNumber = value.supplier_invoice_number?.trim() ?? "";
  if (invoiceNumber.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["supplier_invoice_number"],
      message: "Supplier invoice number is required for purchase and purchase return.",
    });
  }
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

export const supplierCreateSchema = z.object({
  code: z.string().min(2).max(32).optional(),
  name: z.string().min(2).max(160),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const supplierPaymentCreateSchema = z.object({
  supplier_document_id: uuid,
  payment_date: isoDate,
  amount: z.number().positive(),
  note: z.string().max(250).nullable().optional(),
});

export const systemSettingsUpdateSchema = z.object({
  company_name: z.string().trim().min(2).max(160),
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
    password: passwordSchema.optional(),
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
