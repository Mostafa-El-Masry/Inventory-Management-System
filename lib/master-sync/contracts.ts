export const MASTER_ENTITIES = [
  "locations",
  "products",
  "categories",
  "subcategories",
  "suppliers",
] as const;

export type MasterEntity = (typeof MASTER_ENTITIES)[number];

export const MASTER_IMPORT_HEADERS: Record<MasterEntity, readonly string[]> = {
  locations: ["code", "name", "timezone", "is_active"],
  suppliers: ["code", "name", "phone", "email", "is_active"],
  categories: ["code", "name", "is_active"],
  subcategories: ["category_code", "code", "name", "is_active"],
  products: [
    "sku",
    "name",
    "barcode",
    "unit",
    "is_active",
    "description",
    "category_code",
    "subcategory_code",
  ],
};

export const MASTER_IMPORT_MAX_ROWS: Record<MasterEntity, number> = {
  products: 500,
  locations: 1000,
  suppliers: 1000,
  categories: 1000,
  subcategories: 1000,
};

export type MasterImportRejectedRow = {
  row_number: number;
  key: string;
  reason: string;
  first_row_number?: number;
};

export type MasterImportSummary = {
  entity: MasterEntity;
  processed_count: number;
  inserted_count: number;
  updated_count: number;
  rejected_count: number;
  rejected_rows: MasterImportRejectedRow[];
};

export type LocationImportRow = {
  code: string;
  name: string;
  timezone: string;
  is_active: boolean;
};

export type SupplierImportRow = {
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

export type CategoryImportRow = {
  code: string;
  name: string;
  is_active: boolean;
};

export type SubcategoryImportRow = {
  category_code: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type ProductImportRow = {
  sku: string;
  name: string;
  barcode: string | null;
  unit: string;
  is_active: boolean;
  description: string | null;
  category_code: string;
  subcategory_code: string;
};

export type MasterImportRowByEntity = {
  locations: LocationImportRow;
  suppliers: SupplierImportRow;
  categories: CategoryImportRow;
  subcategories: SubcategoryImportRow;
  products: ProductImportRow;
};

export type ParsedMasterRow<E extends MasterEntity> = {
  row_number: number;
  key: string;
  value: MasterImportRowByEntity[E];
};

export type ParsedMasterCsvResult<E extends MasterEntity> = {
  entity: E;
  processed_count: number;
  rows: ParsedMasterRow<E>[];
  rejected_rows: MasterImportRejectedRow[];
};
