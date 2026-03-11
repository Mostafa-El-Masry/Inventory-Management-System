import { z } from "zod";
import { normalizeImportName } from "@/lib/import-text/normalize-import-name";
import { parseCsv } from "@/lib/utils/csv";

export const PRODUCT_IMPORT_BATCH_SIZE = 500;
export const PRODUCT_MAX_COUNT = 10000;
export const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
  "name",
  "category_name",
  "subcategory_name",
  "barcode",
  "unit",
  "is_active",
  "description",
] as const;

export type ProductImportRow = {
  name: string;
  category_name: string | null;
  subcategory_name: string | null;
  barcode: string | null;
  unit: string;
  is_active: boolean;
  description: string | null;
};

export type ProductImportParsedRow = ProductImportRow & {
  row_number: number;
};

export type ProductImportRejectedRow = {
  row_number: number;
  name: string;
  barcode: string | null;
  reason: string;
};

export type ProductImportParseResult = {
  rows: ProductImportParsedRow[];
  rejected_rows: ProductImportRejectedRow[];
  processed_count: number;
};

export class ProductImportError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 422, details?: unknown) {
    super(message);
    this.name = "ProductImportError";
    this.status = status;
    this.details = details;
  }
}

const productImportRowSchema = z.object({
  name: z.string().min(2).max(160),
  category_name: z.string().min(2).max(120).nullable().optional(),
  subcategory_name: z.string().min(2).max(120).nullable().optional(),
  barcode: z.string().max(128).nullable().optional(),
  unit: z.string().min(1).max(24).default("unit"),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
});

const PRODUCT_IMPORT_COLUMN_LABELS = {
  name: "name",
  category_name: "category_name",
  subcategory_name: "subcategory_name",
  barcode: "barcode",
  unit: "unit",
  is_active: "is_active",
  description: "description",
} satisfies Record<string, string>;

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (["true", "1", "yes", "y", "active"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "inactive"].includes(normalized)) {
    return false;
  }

  throw new ProductImportError(
    'Column "is_active": wrong entry. Use true/false, yes/no, or 1/0.',
  );
}

function getCell(cells: string[], columnIndex: number | undefined) {
  if (columnIndex === undefined) {
    return "";
  }
  return cells[columnIndex] ?? "";
}

function getRejectedRowName(name: string) {
  const normalizedName = normalizeImportName(name);
  return normalizedName.length > 0 ? normalizedName : "Unnamed product";
}

function formatColumnIssue({
  field,
  value,
  issue,
}: {
  field: keyof typeof PRODUCT_IMPORT_COLUMN_LABELS;
  value: string | null;
  issue: z.ZodIssue;
}) {
  const label = PRODUCT_IMPORT_COLUMN_LABELS[field];
  const trimmedValue = typeof value === "string" ? value.trim() : value;

  if (issue.code === "too_small" && issue.minimum === 1 && trimmedValue === "") {
    return `Column "${label}": missing data.`;
  }

  if (issue.code === "too_small" && trimmedValue === "") {
    return `Column "${label}": missing data.`;
  }

  if (issue.code === "too_small" && typeof issue.minimum === "number") {
    return `Column "${label}": wrong entry. Must be at least ${issue.minimum} characters.`;
  }

  if (issue.code === "too_big" && typeof issue.maximum === "number") {
    return `Column "${label}": wrong entry. Must be at most ${issue.maximum} characters.`;
  }

  if (issue.code === "invalid_type") {
    return `Column "${label}": wrong entry.`;
  }

  return `Column "${label}": wrong entry.`;
}

function buildProductImportIssueReason({
  candidate,
  rawValues,
  issues,
}: {
  candidate: {
    name: string;
    category_name: string | null;
    subcategory_name: string | null;
    barcode: string | null;
    unit: string;
    description: string | null;
  };
  rawValues: {
    name: string;
    category_name: string;
    subcategory_name: string;
    barcode: string;
    unit: string;
    description: string;
  };
  issues: z.ZodIssue[];
}) {
  const formatted = new Set<string>();

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || !(field in PRODUCT_IMPORT_COLUMN_LABELS)) {
      continue;
    }

    const typedField = field as keyof typeof PRODUCT_IMPORT_COLUMN_LABELS;
    const value =
      typedField === "barcode" || typedField === "description"
        ? rawValues[typedField]
        : typedField in rawValues
          ? rawValues[typedField as keyof typeof rawValues]
          : String(candidate[typedField as keyof typeof candidate] ?? "");

    formatted.add(
      formatColumnIssue({
        field: typedField,
        value: value ?? null,
        issue,
      }),
    );
  }

  return Array.from(formatted).join(" ");
}

export function buildProductImportTemplateCsv() {
  return `${PRODUCT_IMPORT_TEMPLATE_HEADERS.join(",")}\n`;
}

export function parseProductImportCsv(csv: string): ProductImportParseResult {
  let parsedRows: string[][];
  try {
    parsedRows = parseCsv(csv);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid CSV payload.";
    throw new ProductImportError(message);
  }

  if (parsedRows.length === 0) {
    throw new ProductImportError("CSV is empty. Download the template and fill it with products.");
  }

  const headerRow = parsedRows[0].map((cell) => cell.trim().toLowerCase());
  if (headerRow.every((header) => header === "")) {
    throw new ProductImportError("CSV header row is empty.");
  }

  const headerIndex = new Map<string, number>();
  headerRow.forEach((header, index) => {
    if (!headerIndex.has(header)) {
      headerIndex.set(header, index);
    }
  });

  const missingRequiredHeaders = ["name", "category_name", "subcategory_name", "unit"].filter(
    (header) => !headerIndex.has(header),
  );
  if (missingRequiredHeaders.length > 0) {
    throw new ProductImportError(
      `Missing required column(s): ${missingRequiredHeaders.join(", ")}.`,
    );
  }

  const dataRows = parsedRows
    .slice(1)
    .map((cells, index) => ({
      rowNumber: index + 2,
      cells,
    }))
    .filter((row) => row.cells.some((cell) => cell.trim() !== ""));

  if (dataRows.length === 0) {
    throw new ProductImportError("CSV has no data rows. Add at least one product row.");
  }

  const importedRows: ProductImportParsedRow[] = [];
  const rejectedRows: ProductImportRejectedRow[] = [];

  for (const row of dataRows) {
    const name = getCell(row.cells, headerIndex.get("name")).trim();
    const categoryName = getCell(row.cells, headerIndex.get("category_name")).trim();
    const subcategoryName = getCell(row.cells, headerIndex.get("subcategory_name")).trim();
    const unit = getCell(row.cells, headerIndex.get("unit")).trim();
    const barcodeRaw = getCell(row.cells, headerIndex.get("barcode")).trim();
    const descriptionRaw = getCell(row.cells, headerIndex.get("description")).trim();
    const isActiveRaw = getCell(row.cells, headerIndex.get("is_active"));
    let isActive = true;

    try {
      isActive = parseBoolean(isActiveRaw);
    } catch (error) {
      if (error instanceof ProductImportError) {
        rejectedRows.push({
          row_number: row.rowNumber,
          name: getRejectedRowName(name),
          barcode: barcodeRaw.length > 0 ? barcodeRaw : null,
          reason: error.message,
        });
        continue;
      }

      throw error;
    }

    const candidate = {
      name: normalizeImportName(name),
      category_name:
        categoryName.length > 0 && subcategoryName.length > 0 ? categoryName : null,
      subcategory_name:
        categoryName.length > 0 && subcategoryName.length > 0 ? subcategoryName : null,
      barcode: barcodeRaw.length > 0 ? barcodeRaw : null,
      unit: unit.length > 0 ? unit : "unit",
      description: descriptionRaw.length > 0 ? descriptionRaw : null,
      is_active: isActive,
    };

    const parsed = productImportRowSchema.safeParse(candidate);
    if (!parsed.success) {
      rejectedRows.push({
        row_number: row.rowNumber,
        name: getRejectedRowName(name),
        barcode: barcodeRaw.length > 0 ? barcodeRaw : null,
        reason:
          buildProductImportIssueReason({
            candidate,
            rawValues: {
              name,
              category_name: categoryName,
              subcategory_name: subcategoryName,
              barcode: barcodeRaw,
              unit,
              description: descriptionRaw,
            },
            issues: parsed.error.issues,
          }) || "Invalid product data.",
      });
      continue;
    }

    importedRows.push({
      row_number: row.rowNumber,
      name: parsed.data.name,
      category_name: parsed.data.category_name ?? null,
      subcategory_name: parsed.data.subcategory_name ?? null,
      barcode: parsed.data.barcode ?? null,
      unit: parsed.data.unit,
      description: parsed.data.description ?? null,
      is_active: parsed.data.is_active,
    });
  }

  return {
    rows: importedRows,
    rejected_rows: rejectedRows,
    processed_count: dataRows.length,
  };
}
