import { normalizeTaxonomyName } from "@/lib/products/taxonomy";
import {
  mapProductUniqueViolation,
  normalizeProductName,
  normalizeProductSku,
} from "@/lib/products/uniqueness";

import {
  MasterEntity,
  MasterImportRejectedRow,
  MasterImportSummary,
  ParsedMasterCsvResult,
  ParsedMasterRow,
} from "@/lib/master-sync/contracts";

type SupabaseClientLike = {
  from: (table: string) => unknown;
};

type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

type SupabaseQueryLike = {
  select: (...args: unknown[]) => SupabaseQueryLike;
  insert: (values: Record<string, unknown>) => SupabaseQueryLike;
  update: (values: Record<string, unknown>) => SupabaseQueryLike;
  eq: (column: string, value: string | boolean) => SupabaseQueryLike;
  single: () => PromiseLike<{
    data: unknown | null;
    error: DbErrorLike | null;
  }>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryLike;
};

function asQuery(value: unknown) {
  return value as SupabaseQueryLike;
}

type UpsertCounters = {
  inserted_count: number;
  updated_count: number;
};

type LocationRecord = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  is_active: boolean;
};

type SupplierRecord = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type CategoryRecord = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type SubcategoryRecord = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type ProductRecord = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  is_active: boolean;
  category_id: string | null;
  subcategory_id: string | null;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeBarcode(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSupplierName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function addRejectedRow(
  rejectedRows: MasterImportRejectedRow[],
  row: ParsedMasterRow<MasterEntity>,
  reason: string,
) {
  rejectedRows.push({
    row_number: row.row_number,
    key: row.key,
    reason,
  });
}

function getErrorMessage(error: DbErrorLike | null | undefined, fallback: string) {
  return error?.message ?? fallback;
}

async function selectRows<T>(
  query: PromiseLike<{ data: T[] | null; error: DbErrorLike | null }> | unknown,
) {
  const { data, error } = await (query as PromiseLike<{
    data: T[] | null;
    error: DbErrorLike | null;
  }>);
  return {
    data: data ?? [],
    error,
  };
}

async function selectSingle<T>(
  query: PromiseLike<{ data: T | null; error: DbErrorLike | null }> | unknown,
) {
  return (query as PromiseLike<{
    data: T | null;
    error: DbErrorLike | null;
  }>);
}

async function upsertLocations(
  supabase: SupabaseClientLike,
  rows: ParsedMasterRow<"locations">[],
  rejectedRows: MasterImportRejectedRow[],
): Promise<UpsertCounters> {
  const counters: UpsertCounters = { inserted_count: 0, updated_count: 0 };

  const existingResult = await selectRows<LocationRecord>(
    asQuery(supabase.from("locations")).select("id, code, name, timezone, is_active"),
  );
  if (existingResult.error) {
    throw new Error(existingResult.error.message ?? "Failed to load locations.");
  }

  const byCode = new Map<string, LocationRecord>();
  for (const row of existingResult.data) {
    byCode.set(normalizeCode(row.code), row);
  }

  for (const row of rows) {
    const existing = byCode.get(row.value.code);

    if (existing) {
      const updateResult = await selectSingle<LocationRecord>(
        asQuery(supabase.from("locations"))
          .update({
            name: row.value.name,
            timezone: row.value.timezone,
            is_active: row.value.is_active,
          })
          .eq("id", existing.id)
          .select("id, code, name, timezone, is_active")
          .single(),
      );

      if (updateResult.error || !updateResult.data) {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(updateResult.error, "Failed to update location."),
        );
        continue;
      }

      byCode.set(row.value.code, updateResult.data);
      counters.updated_count += 1;
      continue;
    }

    const insertResult = await selectSingle<LocationRecord>(
      asQuery(supabase.from("locations"))
        .insert({
          code: row.value.code,
          name: row.value.name,
          timezone: row.value.timezone,
          is_active: row.value.is_active,
        })
        .select("id, code, name, timezone, is_active")
        .single(),
    );

    if (insertResult.error || !insertResult.data) {
      if (insertResult.error?.code === "23505") {
        addRejectedRow(rejectedRows, row, "Location code already exists.");
      } else {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert location."),
        );
      }
      continue;
    }

    byCode.set(row.value.code, insertResult.data);
    counters.inserted_count += 1;
  }

  return counters;
}

async function upsertSuppliers(
  supabase: SupabaseClientLike,
  rows: ParsedMasterRow<"suppliers">[],
  rejectedRows: MasterImportRejectedRow[],
): Promise<UpsertCounters> {
  const counters: UpsertCounters = { inserted_count: 0, updated_count: 0 };

  const existingResult = await selectRows<SupplierRecord>(
    asQuery(supabase.from("suppliers")).select("id, code, name, phone, email, is_active"),
  );
  if (existingResult.error) {
    throw new Error(existingResult.error.message ?? "Failed to load suppliers.");
  }

  const byCode = new Map<string, SupplierRecord>();
  const nameToId = new Map<string, string>();

  for (const row of existingResult.data) {
    byCode.set(normalizeCode(row.code), row);
    nameToId.set(normalizeSupplierName(row.name), row.id);
  }

  for (const row of rows) {
    const existing = byCode.get(row.value.code);
    const normalizedName = normalizeSupplierName(row.value.name);
    const nameConflictId = nameToId.get(normalizedName);

    if (nameConflictId && nameConflictId !== existing?.id) {
      addRejectedRow(rejectedRows, row, "Supplier name already exists.");
      continue;
    }

    if (existing) {
      const updateResult = await selectSingle<SupplierRecord>(
        asQuery(supabase.from("suppliers"))
          .update({
            name: row.value.name,
            phone: row.value.phone,
            email: row.value.email,
            is_active: row.value.is_active,
          })
          .eq("id", existing.id)
          .select("id, code, name, phone, email, is_active")
          .single(),
      );

      if (updateResult.error || !updateResult.data) {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(updateResult.error, "Failed to update supplier."),
        );
        continue;
      }

      const oldName = normalizeSupplierName(existing.name);
      if (oldName !== normalizedName && nameToId.get(oldName) === existing.id) {
        nameToId.delete(oldName);
      }
      nameToId.set(normalizedName, existing.id);
      byCode.set(row.value.code, updateResult.data);
      counters.updated_count += 1;
      continue;
    }

    const insertResult = await selectSingle<SupplierRecord>(
      asQuery(supabase.from("suppliers"))
        .insert({
          code: row.value.code,
          name: row.value.name,
          phone: row.value.phone,
          email: row.value.email,
          is_active: row.value.is_active,
        })
        .select("id, code, name, phone, email, is_active")
        .single(),
    );

    if (insertResult.error || !insertResult.data) {
      if (insertResult.error?.code === "23505") {
        addRejectedRow(rejectedRows, row, "Supplier code already exists.");
      } else {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert supplier."),
        );
      }
      continue;
    }

    byCode.set(row.value.code, insertResult.data);
    nameToId.set(normalizedName, insertResult.data.id);
    counters.inserted_count += 1;
  }

  return counters;
}

async function upsertCategories(
  supabase: SupabaseClientLike,
  rows: ParsedMasterRow<"categories">[],
  rejectedRows: MasterImportRejectedRow[],
): Promise<UpsertCounters> {
  const counters: UpsertCounters = { inserted_count: 0, updated_count: 0 };

  const existingResult = await selectRows<CategoryRecord>(
    asQuery(supabase.from("product_categories")).select("id, code, name, is_active"),
  );
  if (existingResult.error) {
    throw new Error(existingResult.error.message ?? "Failed to load categories.");
  }

  const byCode = new Map<string, CategoryRecord>();
  const nameToId = new Map<string, string>();

  for (const row of existingResult.data) {
    byCode.set(normalizeCode(row.code), row);
    nameToId.set(normalizeTaxonomyName(row.name), row.id);
  }

  for (const row of rows) {
    const existing = byCode.get(row.value.code);
    const normalizedName = normalizeTaxonomyName(row.value.name);
    const nameConflictId = nameToId.get(normalizedName);

    if (nameConflictId && nameConflictId !== existing?.id) {
      addRejectedRow(rejectedRows, row, "Category name already exists.");
      continue;
    }

    if (existing) {
      const updateResult = await selectSingle<CategoryRecord>(
        asQuery(supabase.from("product_categories"))
          .update({
            name: row.value.name,
            is_active: row.value.is_active,
          })
          .eq("id", existing.id)
          .select("id, code, name, is_active")
          .single(),
      );

      if (updateResult.error || !updateResult.data) {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(updateResult.error, "Failed to update category."),
        );
        continue;
      }

      const oldName = normalizeTaxonomyName(existing.name);
      if (oldName !== normalizedName && nameToId.get(oldName) === existing.id) {
        nameToId.delete(oldName);
      }
      nameToId.set(normalizedName, existing.id);
      byCode.set(row.value.code, updateResult.data);
      counters.updated_count += 1;
      continue;
    }

    const insertResult = await selectSingle<CategoryRecord>(
      asQuery(supabase.from("product_categories"))
        .insert({
          code: row.value.code,
          name: row.value.name,
          is_active: row.value.is_active,
        })
        .select("id, code, name, is_active")
        .single(),
    );

    if (insertResult.error || !insertResult.data) {
      if (insertResult.error?.code === "23505") {
        addRejectedRow(rejectedRows, row, "Category code or name already exists.");
      } else {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert category."),
        );
      }
      continue;
    }

    byCode.set(row.value.code, insertResult.data);
    nameToId.set(normalizedName, insertResult.data.id);
    counters.inserted_count += 1;
  }

  return counters;
}

function getNestedNameMap(source: Map<string, Map<string, string>>, key: string) {
  const existing = source.get(key);
  if (existing) {
    return existing;
  }

  const created = new Map<string, string>();
  source.set(key, created);
  return created;
}

async function upsertSubcategories(
  supabase: SupabaseClientLike,
  rows: ParsedMasterRow<"subcategories">[],
  rejectedRows: MasterImportRejectedRow[],
): Promise<UpsertCounters> {
  const counters: UpsertCounters = { inserted_count: 0, updated_count: 0 };

  const categoriesResult = await selectRows<{ id: string; code: string }>(
    asQuery(supabase.from("product_categories")).select("id, code"),
  );
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message ?? "Failed to load categories.");
  }

  const categoryIdByCode = new Map<string, string>();
  for (const category of categoriesResult.data) {
    categoryIdByCode.set(normalizeCode(category.code), category.id);
  }

  const existingResult = await selectRows<SubcategoryRecord>(
    asQuery(supabase.from("product_subcategories"))
      .select("id, category_id, code, name, is_active"),
  );
  if (existingResult.error) {
    throw new Error(existingResult.error.message ?? "Failed to load subcategories.");
  }

  const byCompositeKey = new Map<string, SubcategoryRecord>();
  const categoryNameToId = new Map<string, Map<string, string>>();

  for (const row of existingResult.data) {
    const normalizedCode = normalizeCode(row.code);
    byCompositeKey.set(`${row.category_id}:${normalizedCode}`, {
      ...row,
      code: normalizedCode,
    });

    const nameMap = getNestedNameMap(categoryNameToId, row.category_id);
    nameMap.set(normalizeTaxonomyName(row.name), row.id);
  }

  for (const row of rows) {
    const categoryId = categoryIdByCode.get(row.value.category_code);
    if (!categoryId) {
      addRejectedRow(
        rejectedRows,
        row,
        `Category code "${row.value.category_code}" does not exist.`,
      );
      continue;
    }

    const composite = `${categoryId}:${row.value.code}`;
    const existing = byCompositeKey.get(composite);
    const nameMap = getNestedNameMap(categoryNameToId, categoryId);
    const normalizedName = normalizeTaxonomyName(row.value.name);
    const nameConflictId = nameMap.get(normalizedName);

    if (nameConflictId && nameConflictId !== existing?.id) {
      addRejectedRow(
        rejectedRows,
        row,
        "Subcategory name already exists in this category.",
      );
      continue;
    }

    if (existing) {
      const updateResult = await selectSingle<SubcategoryRecord>(
        asQuery(supabase.from("product_subcategories"))
          .update({
            name: row.value.name,
            is_active: row.value.is_active,
          })
          .eq("id", existing.id)
          .select("id, category_id, code, name, is_active")
          .single(),
      );

      if (updateResult.error || !updateResult.data) {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(updateResult.error, "Failed to update subcategory."),
        );
        continue;
      }

      const oldName = normalizeTaxonomyName(existing.name);
      if (oldName !== normalizedName && nameMap.get(oldName) === existing.id) {
        nameMap.delete(oldName);
      }
      nameMap.set(normalizedName, existing.id);
      byCompositeKey.set(composite, {
        ...updateResult.data,
        code: normalizeCode(updateResult.data.code),
      });
      counters.updated_count += 1;
      continue;
    }

    const insertResult = await selectSingle<SubcategoryRecord>(
      asQuery(supabase.from("product_subcategories"))
        .insert({
          category_id: categoryId,
          code: row.value.code,
          name: row.value.name,
          is_active: row.value.is_active,
        })
        .select("id, category_id, code, name, is_active")
        .single(),
    );

    if (insertResult.error || !insertResult.data) {
      if (insertResult.error?.code === "23505") {
        addRejectedRow(rejectedRows, row, "Subcategory code or name already exists.");
      } else {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert subcategory."),
        );
      }
      continue;
    }

    byCompositeKey.set(composite, {
      ...insertResult.data,
      code: normalizeCode(insertResult.data.code),
    });
    nameMap.set(normalizedName, insertResult.data.id);
    counters.inserted_count += 1;
  }

  return counters;
}

async function upsertProducts(
  supabase: SupabaseClientLike,
  rows: ParsedMasterRow<"products">[],
  rejectedRows: MasterImportRejectedRow[],
): Promise<UpsertCounters> {
  const counters: UpsertCounters = { inserted_count: 0, updated_count: 0 };

  const categoriesResult = await selectRows<{ id: string; code: string }>(
    asQuery(supabase.from("product_categories")).select("id, code"),
  );
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message ?? "Failed to load categories.");
  }

  const categoryIdByCode = new Map<string, string>();
  for (const category of categoriesResult.data) {
    categoryIdByCode.set(normalizeCode(category.code), category.id);
  }

  const subcategoriesResult = await selectRows<{ id: string; category_id: string; code: string }>(
    asQuery(supabase.from("product_subcategories")).select("id, category_id, code"),
  );
  if (subcategoriesResult.error) {
    throw new Error(subcategoriesResult.error.message ?? "Failed to load subcategories.");
  }

  const subcategoryIdByComposite = new Map<string, string>();
  for (const subcategory of subcategoriesResult.data) {
    subcategoryIdByComposite.set(
      `${subcategory.category_id}:${normalizeCode(subcategory.code)}`,
      subcategory.id,
    );
  }

  const existingResult = await selectRows<ProductRecord>(
    asQuery(supabase.from("products"))
      .select("id, sku, barcode, name, description, unit, is_active, category_id, subcategory_id"),
  );
  if (existingResult.error) {
    throw new Error(existingResult.error.message ?? "Failed to load products.");
  }

  const bySku = new Map<string, ProductRecord>();
  const nameToId = new Map<string, string>();
  const barcodeToId = new Map<string, string>();

  for (const row of existingResult.data) {
    const normalizedSku = normalizeProductSku(row.sku);
    bySku.set(normalizedSku, {
      ...row,
      sku: normalizedSku,
    });
    nameToId.set(normalizeProductName(row.name), row.id);
    if (row.barcode) {
      const normalizedBarcode = normalizeBarcode(row.barcode);
      if (normalizedBarcode) {
        barcodeToId.set(normalizedBarcode, row.id);
      }
    }
  }

  for (const row of rows) {
    const categoryId = categoryIdByCode.get(row.value.category_code);
    if (!categoryId) {
      addRejectedRow(
        rejectedRows,
        row,
        `Category code "${row.value.category_code}" does not exist.`,
      );
      continue;
    }

    const subcategoryId = subcategoryIdByComposite.get(
      `${categoryId}:${row.value.subcategory_code}`,
    );
    if (!subcategoryId) {
      addRejectedRow(
        rejectedRows,
        row,
        `Subcategory code "${row.value.subcategory_code}" does not exist under category "${row.value.category_code}".`,
      );
      continue;
    }

    const existing = bySku.get(row.value.sku);

    const normalizedName = normalizeProductName(row.value.name);
    const nameConflictId = nameToId.get(normalizedName);
    if (nameConflictId && nameConflictId !== existing?.id) {
      addRejectedRow(rejectedRows, row, "Product name already exists.");
      continue;
    }

    const normalizedBarcode = row.value.barcode ? normalizeBarcode(row.value.barcode) : null;
    if (normalizedBarcode) {
      const barcodeConflictId = barcodeToId.get(normalizedBarcode);
      if (barcodeConflictId && barcodeConflictId !== existing?.id) {
        addRejectedRow(rejectedRows, row, "Product barcode already exists.");
        continue;
      }
    }

    if (existing) {
      const updateResult = await selectSingle<ProductRecord>(
        asQuery(supabase.from("products"))
          .update({
            name: row.value.name,
            barcode: row.value.barcode,
            description: row.value.description,
            unit: row.value.unit,
            is_active: row.value.is_active,
            category_id: categoryId,
            subcategory_id: subcategoryId,
          })
          .eq("id", existing.id)
          .select("id, sku, barcode, name, description, unit, is_active, category_id, subcategory_id")
          .single(),
      );

      if (updateResult.error || !updateResult.data) {
        const mappedUnique = mapProductUniqueViolation(updateResult.error ?? {});
        addRejectedRow(
          rejectedRows,
          row,
          mappedUnique ?? getErrorMessage(updateResult.error, "Failed to update product."),
        );
        continue;
      }

      const oldName = normalizeProductName(existing.name);
      if (oldName !== normalizedName && nameToId.get(oldName) === existing.id) {
        nameToId.delete(oldName);
      }
      nameToId.set(normalizedName, existing.id);

      const oldBarcode = existing.barcode ? normalizeBarcode(existing.barcode) : null;
      if (
        oldBarcode &&
        oldBarcode !== normalizedBarcode &&
        barcodeToId.get(oldBarcode) === existing.id
      ) {
        barcodeToId.delete(oldBarcode);
      }
      if (normalizedBarcode) {
        barcodeToId.set(normalizedBarcode, existing.id);
      }

      bySku.set(row.value.sku, {
        ...updateResult.data,
        sku: normalizeProductSku(updateResult.data.sku),
      });
      counters.updated_count += 1;
      continue;
    }

    const insertResult = await selectSingle<ProductRecord>(
      asQuery(supabase.from("products"))
        .insert({
          sku: row.value.sku,
          name: row.value.name,
          barcode: row.value.barcode,
          description: row.value.description,
          unit: row.value.unit,
          is_active: row.value.is_active,
          category_id: categoryId,
          subcategory_id: subcategoryId,
        })
        .select("id, sku, barcode, name, description, unit, is_active, category_id, subcategory_id")
        .single(),
    );

    if (insertResult.error || !insertResult.data) {
      const mappedUnique = mapProductUniqueViolation(insertResult.error ?? {});
      addRejectedRow(
        rejectedRows,
        row,
        mappedUnique ?? getErrorMessage(insertResult.error, "Failed to insert product."),
      );
      continue;
    }

    bySku.set(row.value.sku, {
      ...insertResult.data,
      sku: normalizeProductSku(insertResult.data.sku),
    });
    nameToId.set(normalizedName, insertResult.data.id);
    if (normalizedBarcode) {
      barcodeToId.set(normalizedBarcode, insertResult.data.id);
    }
    counters.inserted_count += 1;
  }

  return counters;
}

export async function upsertMasterRows<E extends MasterEntity>(
  supabase: SupabaseClientLike,
  parsed: ParsedMasterCsvResult<E>,
): Promise<MasterImportSummary> {
  const rejectedRows: MasterImportRejectedRow[] = [...parsed.rejected_rows];

  let counters: UpsertCounters = {
    inserted_count: 0,
    updated_count: 0,
  };

  switch (parsed.entity) {
    case "locations":
      counters = await upsertLocations(
        supabase,
        parsed.rows as ParsedMasterRow<"locations">[],
        rejectedRows,
      );
      break;
    case "suppliers":
      counters = await upsertSuppliers(
        supabase,
        parsed.rows as ParsedMasterRow<"suppliers">[],
        rejectedRows,
      );
      break;
    case "categories":
      counters = await upsertCategories(
        supabase,
        parsed.rows as ParsedMasterRow<"categories">[],
        rejectedRows,
      );
      break;
    case "subcategories":
      counters = await upsertSubcategories(
        supabase,
        parsed.rows as ParsedMasterRow<"subcategories">[],
        rejectedRows,
      );
      break;
    case "products":
      counters = await upsertProducts(
        supabase,
        parsed.rows as ParsedMasterRow<"products">[],
        rejectedRows,
      );
      break;
    default:
      counters = {
        inserted_count: 0,
        updated_count: 0,
      };
      break;
  }

  return {
    entity: parsed.entity,
    processed_count: parsed.processed_count,
    inserted_count: counters.inserted_count,
    updated_count: counters.updated_count,
    rejected_count: rejectedRows.length,
    rejected_rows: rejectedRows,
  };
}
