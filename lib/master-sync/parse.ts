import { parseCsv } from "@/lib/utils/csv";
import { normalizeImportName } from "@/lib/import-text/normalize-import-name";

import {
  MASTER_IMPORT_TEMPLATE_HEADERS,
  MASTER_IMPORT_MAX_ROWS,
  MasterEntity,
  MasterImportRejectedRow,
  ParsedMasterCsvResult,
  ParsedMasterRow,
  CategoryImportRow,
  LocationImportRow,
  ProductImportRow,
  SubcategoryImportRow,
  SupplierImportRow,
} from "@/lib/master-sync/contracts";

const LOCATION_CODE_REGEX = /^[A-Z0-9-]{2,32}$/;
const CATEGORY_CODE_REGEX = /^[0-9]{2}$/;
const SUBCATEGORY_CODE_REGEX = /^[0-9]{3}$/;
const SKU_REGEX = /^[A-Z0-9-]{2,64}$/;

const MASTER_IMPORT_REQUIRED_HEADER_GROUPS: Record<MasterEntity, readonly (readonly string[])[]> = {
  locations: [["name"], ["timezone"], ["is_active"]],
  suppliers: [["name"], ["phone"], ["email"], ["is_active"]],
  categories: [["name"], ["is_active"]],
  subcategories: [["category_name", "category_code"], ["name"], ["is_active"]],
  products: [
    ["name"],
    ["barcode"],
    ["unit"],
    ["is_active"],
    ["description"],
    ["category_name", "category_code"],
    ["subcategory_name", "subcategory_code"],
  ],
};

export class MasterCsvImportError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 422, details?: unknown) {
    super(message);
    this.name = "MasterCsvImportError";
    this.status = status;
    this.details = details;
  }
}

class MasterCsvRowError extends Error {
  key: string;

  constructor(message: string, key: string) {
    super(message);
    this.name = "MasterCsvRowError";
    this.key = key;
  }
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeNullableString(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isRowEmpty(cells: string[]) {
  return cells.every((cell) => cell.trim().length === 0);
}

function getCell(cells: string[], index: number | undefined) {
  if (index === undefined) {
    return "";
  }

  return cells[index] ?? "";
}

function requireValue(value: string, field: string, rowNumber: number, key: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new MasterCsvRowError(`${field} is required at row ${rowNumber}.`, key);
  }

  return trimmed;
}

function requireName(value: string, field: string, rowNumber: number, key: string) {
  return normalizeImportName(requireValue(value, field, rowNumber, key));
}

function ensureLength(
  value: string,
  field: string,
  rowNumber: number,
  key: string,
  min: number,
  max: number,
) {
  if (value.length < min || value.length > max) {
    throw new MasterCsvRowError(
      `${field} must be between ${min} and ${max} characters at row ${rowNumber}.`,
      key,
    );
  }
}

function parseBoolean(value: string, rowNumber: number, key: string) {
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

  throw new MasterCsvRowError(
    `Invalid is_active value at row ${rowNumber}. Use true/false, yes/no, or 1/0.`,
    key,
  );
}

function parseLocationRow(
  cells: string[],
  rowNumber: number,
  headerIndex: Map<string, number>,
): ParsedMasterRow<"locations"> {
  const code = normalizeCode(getCell(cells, headerIndex.get("code")));
  const name = requireName(
    getCell(cells, headerIndex.get("name")),
    "name",
    rowNumber,
    code || `row-${rowNumber}`,
  );
  const key = code || `name:${normalizeNameKey(name)}`;
  const timezone = requireValue(
    getCell(cells, headerIndex.get("timezone")),
    "timezone",
    rowNumber,
    key,
  );
  const isActive = parseBoolean(getCell(cells, headerIndex.get("is_active")), rowNumber, key);

  if (code && !LOCATION_CODE_REGEX.test(code)) {
    throw new MasterCsvRowError(
      `Invalid location code at row ${rowNumber}. Use 2-32 characters: A-Z, 0-9, and '-'.`,
      key,
    );
  }

  ensureLength(name, "name", rowNumber, key, 2, 128);
  ensureLength(timezone, "timezone", rowNumber, key, 3, 64);

  const value: LocationImportRow = {
    code: code || null,
    name,
    timezone,
    is_active: isActive,
  };

  return {
    row_number: rowNumber,
    key,
    value,
  };
}

function parseSupplierRow(
  cells: string[],
  rowNumber: number,
  headerIndex: Map<string, number>,
): ParsedMasterRow<"suppliers"> {
  const code = normalizeCode(getCell(cells, headerIndex.get("code")));
  const name = requireName(
    getCell(cells, headerIndex.get("name")),
    "name",
    rowNumber,
    code || `row-${rowNumber}`,
  );
  const key = code || `name:${normalizeNameKey(name)}`;
  const phone = normalizeNullableString(getCell(cells, headerIndex.get("phone")));
  const emailRaw = normalizeNullableString(getCell(cells, headerIndex.get("email")));
  const email = emailRaw ? emailRaw.toLowerCase() : null;
  const isActive = parseBoolean(getCell(cells, headerIndex.get("is_active")), rowNumber, key);

  if (code && !LOCATION_CODE_REGEX.test(code)) {
    throw new MasterCsvRowError(
      `Invalid supplier code at row ${rowNumber}. Use 2-32 characters: A-Z, 0-9, and '-'.`,
      key,
    );
  }

  ensureLength(name, "name", rowNumber, key, 2, 160);
  if (phone) {
    ensureLength(phone, "phone", rowNumber, key, 1, 40);
  }
  if (email) {
    ensureLength(email, "email", rowNumber, key, 3, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new MasterCsvRowError(`Invalid email format at row ${rowNumber}.`, key);
    }
  }

  const value: SupplierImportRow = {
    code: code || null,
    name,
    phone,
    email,
    is_active: isActive,
  };

  return {
    row_number: rowNumber,
    key,
    value,
  };
}

function parseCategoryRow(
  cells: string[],
  rowNumber: number,
  headerIndex: Map<string, number>,
): ParsedMasterRow<"categories"> {
  const code = normalizeCode(getCell(cells, headerIndex.get("code")));
  const name = requireName(
    getCell(cells, headerIndex.get("name")),
    "name",
    rowNumber,
    code || `row-${rowNumber}`,
  );
  const key = code || `name:${normalizeNameKey(name)}`;
  const isActive = parseBoolean(getCell(cells, headerIndex.get("is_active")), rowNumber, key);

  if (code && !CATEGORY_CODE_REGEX.test(code)) {
    throw new MasterCsvRowError(
      `Invalid category code at row ${rowNumber}. Expected 2 digits (e.g., 01).`,
      key,
    );
  }

  ensureLength(name, "name", rowNumber, key, 2, 120);

  const value: CategoryImportRow = {
    code: code || null,
    name,
    is_active: isActive,
  };

  return {
    row_number: rowNumber,
    key,
    value,
  };
}

function parseSubcategoryRow(
  cells: string[],
  rowNumber: number,
  headerIndex: Map<string, number>,
): ParsedMasterRow<"subcategories"> {
  const categoryCode = normalizeCode(getCell(cells, headerIndex.get("category_code")));
  const categoryName = normalizeNullableString(getCell(cells, headerIndex.get("category_name")));
  const code = normalizeCode(getCell(cells, headerIndex.get("code")));
  const name = requireName(
    getCell(cells, headerIndex.get("name")),
    "name",
    rowNumber,
    code || categoryCode || categoryName || `row-${rowNumber}`,
  );
  const categoryRef = categoryCode || categoryName || `row-${rowNumber}`;
  const key = code
    ? `${categoryRef}:${code}`
    : `${categoryRef}:name:${normalizeNameKey(name)}`;
  const isActive = parseBoolean(getCell(cells, headerIndex.get("is_active")), rowNumber, key);

  if (!categoryCode && !categoryName) {
    throw new MasterCsvRowError(
      `category_name or category_code is required at row ${rowNumber}.`,
      key,
    );
  }

  if (categoryCode && !CATEGORY_CODE_REGEX.test(categoryCode)) {
    throw new MasterCsvRowError(
      `Invalid category_code at row ${rowNumber}. Expected 2 digits (e.g., 01).`,
      key,
    );
  }

  if (code && !SUBCATEGORY_CODE_REGEX.test(code)) {
    throw new MasterCsvRowError(
      `Invalid subcategory code at row ${rowNumber}. Expected 3 digits (e.g., 001).`,
      key,
    );
  }

  ensureLength(name, "name", rowNumber, key, 2, 120);

  const value: SubcategoryImportRow = {
    category_code: categoryCode || null,
    category_name: categoryName,
    code: code || null,
    name,
    is_active: isActive,
  };

  return {
    row_number: rowNumber,
    key,
    value,
  };
}

function parseProductRow(
  cells: string[],
  rowNumber: number,
  headerIndex: Map<string, number>,
): ParsedMasterRow<"products"> {
  const sku = normalizeCode(getCell(cells, headerIndex.get("sku")));
  const name = requireName(
    getCell(cells, headerIndex.get("name")),
    "name",
    rowNumber,
    sku || `row-${rowNumber}`,
  );
  const key = sku || `name:${normalizeNameKey(name)}`;
  const unit = requireValue(getCell(cells, headerIndex.get("unit")), "unit", rowNumber, key);
  const categoryCode = normalizeCode(getCell(cells, headerIndex.get("category_code")));
  const categoryName = normalizeNullableString(getCell(cells, headerIndex.get("category_name")));
  const subcategoryCode = normalizeCode(getCell(cells, headerIndex.get("subcategory_code")));
  const subcategoryName = normalizeNullableString(
    getCell(cells, headerIndex.get("subcategory_name")),
  );

  const barcode = normalizeNullableString(getCell(cells, headerIndex.get("barcode")));
  const description = normalizeNullableString(getCell(cells, headerIndex.get("description")));
  const isActive = parseBoolean(getCell(cells, headerIndex.get("is_active")), rowNumber, key);

  if (sku && !SKU_REGEX.test(sku)) {
    throw new MasterCsvRowError(
      `Invalid SKU at row ${rowNumber}. Use 2-64 characters: A-Z, 0-9, and '-'.`,
      key,
    );
  }

  if (!categoryCode && !categoryName) {
    throw new MasterCsvRowError(
      `category_name or category_code is required at row ${rowNumber}.`,
      key,
    );
  }

  if (categoryCode && !CATEGORY_CODE_REGEX.test(categoryCode)) {
    throw new MasterCsvRowError(
      `Invalid category_code at row ${rowNumber}. Expected 2 digits (e.g., 01).`,
      key,
    );
  }

  if (!subcategoryCode && !subcategoryName) {
    throw new MasterCsvRowError(
      `subcategory_name or subcategory_code is required at row ${rowNumber}.`,
      key,
    );
  }

  if (subcategoryCode && !SUBCATEGORY_CODE_REGEX.test(subcategoryCode)) {
    throw new MasterCsvRowError(
      `Invalid subcategory_code at row ${rowNumber}. Expected 3 digits (e.g., 001).`,
      key,
    );
  }

  ensureLength(name, "name", rowNumber, key, 2, 160);
  ensureLength(unit, "unit", rowNumber, key, 1, 24);
  if (description) {
    ensureLength(description, "description", rowNumber, key, 1, 500);
  }
  if (barcode) {
    ensureLength(barcode, "barcode", rowNumber, key, 1, 128);
  }

  const value: ProductImportRow = {
    sku: sku || null,
    name,
    barcode,
    unit,
    is_active: isActive,
    description,
    category_code: categoryCode || null,
    category_name: categoryName,
    subcategory_code: subcategoryCode || null,
    subcategory_name: subcategoryName,
  };

  return {
    row_number: rowNumber,
    key,
    value,
  };
}

function parseEntityRow(
  entity: MasterEntity,
  cells: string[],
  rowNumber: number,
  headerIndex: Map<string, number>,
): ParsedMasterRow<MasterEntity> {
  switch (entity) {
    case "locations":
      return parseLocationRow(cells, rowNumber, headerIndex);
    case "suppliers":
      return parseSupplierRow(cells, rowNumber, headerIndex);
    case "categories":
      return parseCategoryRow(cells, rowNumber, headerIndex);
    case "subcategories":
      return parseSubcategoryRow(cells, rowNumber, headerIndex);
    case "products":
      return parseProductRow(cells, rowNumber, headerIndex);
    default:
      return {
        row_number: rowNumber,
        key: `row-${rowNumber}`,
        value: {} as never,
      };
  }
}

export function parseMasterImportCsv<E extends MasterEntity>(
  entity: E,
  csv: string,
): ParsedMasterCsvResult<E> {
  let parsedRows: string[][];
  try {
    parsedRows = parseCsv(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CSV payload.";
    throw new MasterCsvImportError(message, 422);
  }

  if (parsedRows.length === 0) {
    throw new MasterCsvImportError("CSV is empty. Download the template and fill it first.");
  }

  const headers = parsedRows[0].map(normalizeHeader);
  if (headers.every((header) => header.length === 0)) {
    throw new MasterCsvImportError("CSV header row is empty.");
  }

  const expectedHeaders = MASTER_IMPORT_TEMPLATE_HEADERS[entity];
  const missingHeaders = MASTER_IMPORT_REQUIRED_HEADER_GROUPS[entity]
    .filter((group) => !group.some((header) => headers.includes(header)))
    .map((group) => group.join(" or "));
  if (missingHeaders.length > 0) {
    throw new MasterCsvImportError(
      `Missing required column(s): ${missingHeaders.join(", ")}.`,
      422,
      { expected_headers: expectedHeaders, missing_headers: missingHeaders },
    );
  }

  const headerIndex = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!headerIndex.has(header)) {
      headerIndex.set(header, index);
    }
  });

  const dataRows = parsedRows
    .slice(1)
    .map((cells, index) => ({
      row_number: index + 2,
      cells,
    }))
    .filter((row) => !isRowEmpty(row.cells));

  if (dataRows.length === 0) {
    throw new MasterCsvImportError("CSV has no data rows. Add at least one row.");
  }

  const maxRows = MASTER_IMPORT_MAX_ROWS[entity];
  if (dataRows.length > maxRows) {
    throw new MasterCsvImportError(
      `CSV contains ${dataRows.length} rows. Maximum allowed for ${entity} is ${maxRows}.`,
      422,
      {
        max_rows: maxRows,
        row_count: dataRows.length,
      },
    );
  }

  const rows: ParsedMasterRow<E>[] = [];
  const rejectedRows: MasterImportRejectedRow[] = [];
  const seenKeys = new Map<string, number>();

  for (const row of dataRows) {
    try {
      const parsed = parseEntityRow(entity, row.cells, row.row_number, headerIndex);
      const firstRowNumber = seenKeys.get(parsed.key);
      if (typeof firstRowNumber === "number") {
        rejectedRows.push({
          row_number: row.row_number,
          key: parsed.key,
          reason: "Duplicate key in CSV.",
          first_row_number: firstRowNumber,
        });
        continue;
      }

      seenKeys.set(parsed.key, row.row_number);
      rows.push(parsed as ParsedMasterRow<E>);
    } catch (error) {
      if (error instanceof MasterCsvRowError) {
        rejectedRows.push({
          row_number: row.row_number,
          key: error.key,
          reason: error.message,
        });
        continue;
      }

      const reason = error instanceof Error ? error.message : "Invalid row.";
      rejectedRows.push({
        row_number: row.row_number,
        key: `row-${row.row_number}`,
        reason,
      });
    }
  }

  return {
    entity,
    processed_count: dataRows.length,
    rows,
    rejected_rows: rejectedRows,
  };
}
