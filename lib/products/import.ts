import { z } from "zod";
import { normalizeImportName } from "@/lib/import-text/normalize-import-name";
import { parseCsv } from "@/lib/utils/csv";

export const PRODUCT_IMPORT_MAX_ROWS = 500;
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
  category_name: string;
  subcategory_name: string;
  barcode: string | null;
  unit: string;
  is_active: boolean;
  description: string | null;
};

export type ProductImportParsedRow = ProductImportRow & {
  row_number: number;
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
  category_name: z.string().min(2).max(120),
  subcategory_name: z.string().min(2).max(120),
  barcode: z.string().max(128).nullable().optional(),
  unit: z.string().min(1).max(24).default("unit"),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
});

function parseBoolean(value: string, rowNumber: number) {
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
    `Invalid is_active value at row ${rowNumber}. Use true/false, yes/no, or 1/0.`,
  );
}

function getCell(cells: string[], columnIndex: number | undefined) {
  if (columnIndex === undefined) {
    return "";
  }
  return cells[columnIndex] ?? "";
}

export function buildProductImportTemplateCsv() {
  return `${PRODUCT_IMPORT_TEMPLATE_HEADERS.join(",")}\n`;
}

export function parseProductImportCsv(csv: string) {
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

  if (dataRows.length > PRODUCT_IMPORT_MAX_ROWS) {
    throw new ProductImportError(
      `CSV contains ${dataRows.length} rows. Maximum allowed per import is ${PRODUCT_IMPORT_MAX_ROWS}.`,
      422,
      {
        max_rows: PRODUCT_IMPORT_MAX_ROWS,
        row_count: dataRows.length,
      },
    );
  }

  const importedRows: ProductImportParsedRow[] = [];

  for (const row of dataRows) {
    const name = getCell(row.cells, headerIndex.get("name")).trim();
    const categoryName = getCell(row.cells, headerIndex.get("category_name")).trim();
    const subcategoryName = getCell(row.cells, headerIndex.get("subcategory_name")).trim();
    const unit = getCell(row.cells, headerIndex.get("unit")).trim();
    const barcodeRaw = getCell(row.cells, headerIndex.get("barcode")).trim();
    const descriptionRaw = getCell(row.cells, headerIndex.get("description")).trim();
    const isActiveRaw = getCell(row.cells, headerIndex.get("is_active"));
    const isActive = parseBoolean(isActiveRaw, row.rowNumber);

    const candidate = {
      name: normalizeImportName(name),
      category_name: categoryName,
      subcategory_name: subcategoryName,
      barcode: barcodeRaw.length > 0 ? barcodeRaw : null,
      unit,
      description: descriptionRaw.length > 0 ? descriptionRaw : null,
      is_active: isActive,
    };

    const parsed = productImportRowSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new ProductImportError(
        `Invalid product data at row ${row.rowNumber}.`,
        422,
        parsed.error.flatten(),
      );
    }

    importedRows.push({
      row_number: row.rowNumber,
      name: parsed.data.name,
      category_name: parsed.data.category_name,
      subcategory_name: parsed.data.subcategory_name,
      barcode: parsed.data.barcode ?? null,
      unit: parsed.data.unit,
      description: parsed.data.description ?? null,
      is_active: parsed.data.is_active,
    });
  }

  return importedRows;
}
