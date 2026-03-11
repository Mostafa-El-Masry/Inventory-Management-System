import { deriveNamePrefix, nextPrefixedCode } from "@/lib/locations/code";
import { createProductWithGeneratedSku } from "@/lib/products/create";
import {
  nextCategoryCode,
  nextSubcategoryCode,
  normalizeTaxonomyName,
} from "@/lib/products/taxonomy";
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
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: string | null;
    error: DbErrorLike | null;
  }>;
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

type CategoryLookupRecord = {
  id: string;
  code: string;
  name: string;
};

type SubcategoryLookupRecord = {
  id: string;
  category_id: string;
  code: string;
  name: string;
};

function asQuery(value: unknown) {
  return value as SupabaseQueryLike;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeBarcode(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSimpleName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSupplierName(value: string) {
  return normalizeSimpleName(value);
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

function getNestedMap<T>(source: Map<string, Map<string, T>>, key: string) {
  const existing = source.get(key);
  if (existing) {
    return existing;
  }

  const created = new Map<string, T>();
  source.set(key, created);
  return created;
}

function getCategoryCodePool(byCode: Map<string, CategoryRecord>, attemptedCodes: string[]) {
  return [...byCode.keys(), ...attemptedCodes];
}

function getSubcategoryCodePool(
  byCompositeKey: Map<string, SubcategoryRecord>,
  categoryId: string,
  attemptedCodes: string[],
) {
  return [
    ...Array.from(byCompositeKey.values())
      .filter((record) => record.category_id === categoryId)
      .map((record) => record.code),
    ...attemptedCodes,
  ];
}

function resolveCategory(
  row: ParsedMasterRow<"subcategories"> | ParsedMasterRow<"products">,
  categoryByCode: Map<string, CategoryLookupRecord>,
  categoryByName: Map<string, CategoryLookupRecord>,
) {
  if (row.value.category_code) {
    return (
      categoryByCode.get(row.value.category_code) ?? {
        id: "",
        code: row.value.category_code,
        name: row.value.category_name ?? row.value.category_code,
      }
    );
  }

  if (row.value.category_name) {
    return (
      categoryByName.get(normalizeTaxonomyName(row.value.category_name)) ?? {
        id: "",
        code: row.value.category_code ?? "",
        name: row.value.category_name,
      }
    );
  }

  return null;
}

function resolveSubcategory(
  row: ParsedMasterRow<"products">,
  categoryId: string,
  subcategoryByCompositeCode: Map<string, SubcategoryLookupRecord>,
  subcategoryByCompositeName: Map<string, SubcategoryLookupRecord>,
) {
  if (row.value.subcategory_code) {
    return (
      subcategoryByCompositeCode.get(`${categoryId}:${row.value.subcategory_code}`) ?? {
        id: "",
        category_id: categoryId,
        code: row.value.subcategory_code,
        name: row.value.subcategory_name ?? row.value.subcategory_code,
      }
    );
  }

  if (row.value.subcategory_name) {
    return (
      subcategoryByCompositeName.get(
        `${categoryId}:${normalizeTaxonomyName(row.value.subcategory_name)}`,
      ) ?? {
        id: "",
        category_id: categoryId,
        code: row.value.subcategory_code ?? "",
        name: row.value.subcategory_name,
      }
    );
  }

  return null;
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
  return query as PromiseLike<{
    data: T | null;
    error: DbErrorLike | null;
  }>;
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
  const byName = new Map<string, LocationRecord>();

  for (const record of existingResult.data) {
    const normalizedCode = normalizeCode(record.code);
    const normalized = { ...record, code: normalizedCode };
    byCode.set(normalizedCode, normalized);
    byName.set(normalizeSimpleName(record.name), normalized);
  }

  for (const row of rows) {
    const normalizedName = normalizeSimpleName(row.value.name);
    const existingByCode = row.value.code ? byCode.get(row.value.code) : undefined;
    const existingByName = byName.get(normalizedName);
    const existing = existingByCode ?? (!row.value.code ? existingByName : undefined);

    if (existingByName && existingByName.id !== existing?.id) {
      addRejectedRow(rejectedRows, row, "Location name already exists.");
      continue;
    }

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

      const updated = {
        ...updateResult.data,
        code: normalizeCode(updateResult.data.code),
      };
      const oldName = normalizeSimpleName(existing.name);
      if (oldName !== normalizedName && byName.get(oldName)?.id === existing.id) {
        byName.delete(oldName);
      }
      byName.set(normalizedName, updated);
      byCode.set(updated.code, updated);
      counters.updated_count += 1;
      continue;
    }

    if (row.value.code) {
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

      const inserted = {
        ...insertResult.data,
        code: normalizeCode(insertResult.data.code),
      };
      byCode.set(inserted.code, inserted);
      byName.set(normalizedName, inserted);
      counters.inserted_count += 1;
      continue;
    }

    const prefix = deriveNamePrefix(row.value.name, "LOC");
    const attemptedCodes: string[] = [];
    let inserted = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedCode = nextPrefixedCode(prefix, [...byCode.keys(), ...attemptedCodes]);
      attemptedCodes.push(generatedCode);

      const insertResult = await selectSingle<LocationRecord>(
        asQuery(supabase.from("locations"))
          .insert({
            code: generatedCode,
            name: row.value.name,
            timezone: row.value.timezone,
            is_active: row.value.is_active,
          })
          .select("id, code, name, timezone, is_active")
          .single(),
      );

      if (!insertResult.error && insertResult.data) {
        const created = {
          ...insertResult.data,
          code: normalizeCode(insertResult.data.code),
        };
        byCode.set(created.code, created);
        byName.set(normalizedName, created);
        counters.inserted_count += 1;
        inserted = true;
        break;
      }

      if (insertResult.error?.code !== "23505") {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert location."),
        );
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      addRejectedRow(rejectedRows, row, "Failed to generate a unique location code.");
    }
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
  const byName = new Map<string, SupplierRecord>();

  for (const record of existingResult.data) {
    const normalizedCode = normalizeCode(record.code);
    const normalized = { ...record, code: normalizedCode };
    byCode.set(normalizedCode, normalized);
    byName.set(normalizeSupplierName(record.name), normalized);
  }

  for (const row of rows) {
    const normalizedName = normalizeSupplierName(row.value.name);
    const existingByCode = row.value.code ? byCode.get(row.value.code) : undefined;
    const existingByName = byName.get(normalizedName);
    const existing = existingByCode ?? (!row.value.code ? existingByName : undefined);

    if (existingByName && existingByName.id !== existing?.id) {
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

      const updated = {
        ...updateResult.data,
        code: normalizeCode(updateResult.data.code),
      };
      const oldName = normalizeSupplierName(existing.name);
      if (oldName !== normalizedName && byName.get(oldName)?.id === existing.id) {
        byName.delete(oldName);
      }
      byName.set(normalizedName, updated);
      byCode.set(updated.code, updated);
      counters.updated_count += 1;
      continue;
    }

    if (row.value.code) {
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

      const inserted = {
        ...insertResult.data,
        code: normalizeCode(insertResult.data.code),
      };
      byCode.set(inserted.code, inserted);
      byName.set(normalizedName, inserted);
      counters.inserted_count += 1;
      continue;
    }

    const prefix = deriveNamePrefix(row.value.name, "SUP");
    const attemptedCodes: string[] = [];
    let inserted = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedCode = nextPrefixedCode(prefix, [...byCode.keys(), ...attemptedCodes]);
      attemptedCodes.push(generatedCode);

      const insertResult = await selectSingle<SupplierRecord>(
        asQuery(supabase.from("suppliers"))
          .insert({
            code: generatedCode,
            name: row.value.name,
            phone: row.value.phone,
            email: row.value.email,
            is_active: row.value.is_active,
          })
          .select("id, code, name, phone, email, is_active")
          .single(),
      );

      if (!insertResult.error && insertResult.data) {
        const created = {
          ...insertResult.data,
          code: normalizeCode(insertResult.data.code),
        };
        byCode.set(created.code, created);
        byName.set(normalizedName, created);
        counters.inserted_count += 1;
        inserted = true;
        break;
      }

      if (insertResult.error?.code !== "23505") {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert supplier."),
        );
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      addRejectedRow(rejectedRows, row, "Failed to generate a unique supplier code.");
    }
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
  const byName = new Map<string, CategoryRecord>();

  for (const record of existingResult.data) {
    const normalizedCode = normalizeCode(record.code);
    const normalized = { ...record, code: normalizedCode };
    byCode.set(normalizedCode, normalized);
    byName.set(normalizeTaxonomyName(record.name), normalized);
  }

  for (const row of rows) {
    const normalizedName = normalizeTaxonomyName(row.value.name);
    const existingByCode = row.value.code ? byCode.get(row.value.code) : undefined;
    const existingByName = byName.get(normalizedName);
    const existing = existingByCode ?? (!row.value.code ? existingByName : undefined);

    if (existingByName && existingByName.id !== existing?.id) {
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

      const updated = {
        ...updateResult.data,
        code: normalizeCode(updateResult.data.code),
      };
      const oldName = normalizeTaxonomyName(existing.name);
      if (oldName !== normalizedName && byName.get(oldName)?.id === existing.id) {
        byName.delete(oldName);
      }
      byName.set(normalizedName, updated);
      byCode.set(updated.code, updated);
      counters.updated_count += 1;
      continue;
    }

    if (row.value.code) {
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

      const inserted = {
        ...insertResult.data,
        code: normalizeCode(insertResult.data.code),
      };
      byCode.set(inserted.code, inserted);
      byName.set(normalizedName, inserted);
      counters.inserted_count += 1;
      continue;
    }

    const attemptedCodes: string[] = [];
    let inserted = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedCode = nextCategoryCode(getCategoryCodePool(byCode, attemptedCodes));
      if (!generatedCode) {
        addRejectedRow(rejectedRows, row, "Category code space exhausted.");
        inserted = true;
        break;
      }
      attemptedCodes.push(generatedCode);

      const insertResult = await selectSingle<CategoryRecord>(
        asQuery(supabase.from("product_categories"))
          .insert({
            code: generatedCode,
            name: row.value.name,
            is_active: row.value.is_active,
          })
          .select("id, code, name, is_active")
          .single(),
      );

      if (!insertResult.error && insertResult.data) {
        const created = {
          ...insertResult.data,
          code: normalizeCode(insertResult.data.code),
        };
        byCode.set(created.code, created);
        byName.set(normalizedName, created);
        counters.inserted_count += 1;
        inserted = true;
        break;
      }

      if (insertResult.error?.code !== "23505") {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert category."),
        );
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      addRejectedRow(rejectedRows, row, "Category code space exhausted.");
    }
  }

  return counters;
}

async function upsertSubcategories(
  supabase: SupabaseClientLike,
  rows: ParsedMasterRow<"subcategories">[],
  rejectedRows: MasterImportRejectedRow[],
): Promise<UpsertCounters> {
  const counters: UpsertCounters = { inserted_count: 0, updated_count: 0 };

  const categoriesResult = await selectRows<CategoryLookupRecord>(
    asQuery(supabase.from("product_categories")).select("id, code, name"),
  );
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message ?? "Failed to load categories.");
  }

  const categoryByCode = new Map<string, CategoryLookupRecord>();
  const categoryByName = new Map<string, CategoryLookupRecord>();
  for (const category of categoriesResult.data) {
    const normalizedCode = normalizeCode(category.code);
    const normalized = { ...category, code: normalizedCode };
    categoryByCode.set(normalizedCode, normalized);
    categoryByName.set(normalizeTaxonomyName(category.name), normalized);
  }

  const existingResult = await selectRows<SubcategoryRecord>(
    asQuery(supabase.from("product_subcategories")).select("id, category_id, code, name, is_active"),
  );
  if (existingResult.error) {
    throw new Error(existingResult.error.message ?? "Failed to load subcategories.");
  }

  const byCompositeKey = new Map<string, SubcategoryRecord>();
  const byCategoryName = new Map<string, Map<string, SubcategoryRecord>>();

  for (const record of existingResult.data) {
    const normalizedCode = normalizeCode(record.code);
    const normalized = { ...record, code: normalizedCode };
    byCompositeKey.set(`${record.category_id}:${normalizedCode}`, normalized);
    getNestedMap(byCategoryName, record.category_id).set(
      normalizeTaxonomyName(record.name),
      normalized,
    );
  }

  for (const row of rows) {
    const category = resolveCategory(row, categoryByCode, categoryByName);
    if (!category || !category.id) {
      const label = row.value.category_name ?? row.value.category_code ?? "unknown";
      const field = row.value.category_name ? "Category name" : "Category code";
      addRejectedRow(rejectedRows, row, `${field} "${label}" does not exist.`);
      continue;
    }

    const normalizedName = normalizeTaxonomyName(row.value.name);
    const existingByCode = row.value.code
      ? byCompositeKey.get(`${category.id}:${row.value.code}`)
      : undefined;
    const nameMap = getNestedMap(byCategoryName, category.id);
    const existingByName = nameMap.get(normalizedName);
    const existing = existingByCode ?? (!row.value.code ? existingByName : undefined);

    if (existingByName && existingByName.id !== existing?.id) {
      addRejectedRow(rejectedRows, row, "Subcategory name already exists in this category.");
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

      const updated = {
        ...updateResult.data,
        code: normalizeCode(updateResult.data.code),
      };
      const oldName = normalizeTaxonomyName(existing.name);
      if (oldName !== normalizedName && nameMap.get(oldName)?.id === existing.id) {
        nameMap.delete(oldName);
      }
      nameMap.set(normalizedName, updated);
      byCompositeKey.set(`${category.id}:${updated.code}`, updated);
      counters.updated_count += 1;
      continue;
    }

    if (row.value.code) {
      const insertResult = await selectSingle<SubcategoryRecord>(
        asQuery(supabase.from("product_subcategories"))
          .insert({
            category_id: category.id,
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

      const inserted = {
        ...insertResult.data,
        code: normalizeCode(insertResult.data.code),
      };
      byCompositeKey.set(`${category.id}:${inserted.code}`, inserted);
      nameMap.set(normalizedName, inserted);
      counters.inserted_count += 1;
      continue;
    }

    const attemptedCodes: string[] = [];
    let inserted = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedCode = nextSubcategoryCode(
        getSubcategoryCodePool(byCompositeKey, category.id, attemptedCodes),
      );
      if (!generatedCode) {
        addRejectedRow(rejectedRows, row, "Subcategory code space exhausted for this category.");
        inserted = true;
        break;
      }
      attemptedCodes.push(generatedCode);

      const insertResult = await selectSingle<SubcategoryRecord>(
        asQuery(supabase.from("product_subcategories"))
          .insert({
            category_id: category.id,
            code: generatedCode,
            name: row.value.name,
            is_active: row.value.is_active,
          })
          .select("id, category_id, code, name, is_active")
          .single(),
      );

      if (!insertResult.error && insertResult.data) {
        const created = {
          ...insertResult.data,
          code: normalizeCode(insertResult.data.code),
        };
        byCompositeKey.set(`${category.id}:${created.code}`, created);
        nameMap.set(normalizedName, created);
        counters.inserted_count += 1;
        inserted = true;
        break;
      }

      if (insertResult.error?.code !== "23505") {
        addRejectedRow(
          rejectedRows,
          row,
          getErrorMessage(insertResult.error, "Failed to insert subcategory."),
        );
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      addRejectedRow(rejectedRows, row, "Failed to generate a unique subcategory code.");
    }
  }

  return counters;
}

async function upsertProducts(
  supabase: SupabaseClientLike,
  rows: ParsedMasterRow<"products">[],
  rejectedRows: MasterImportRejectedRow[],
): Promise<UpsertCounters> {
  const counters: UpsertCounters = { inserted_count: 0, updated_count: 0 };

  const categoriesResult = await selectRows<CategoryLookupRecord>(
    asQuery(supabase.from("product_categories")).select("id, code, name"),
  );
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message ?? "Failed to load categories.");
  }

  const categoryByCode = new Map<string, CategoryLookupRecord>();
  const categoryByName = new Map<string, CategoryLookupRecord>();
  for (const category of categoriesResult.data) {
    const normalizedCode = normalizeCode(category.code);
    const normalized = { ...category, code: normalizedCode };
    categoryByCode.set(normalizedCode, normalized);
    categoryByName.set(normalizeTaxonomyName(category.name), normalized);
  }

  const subcategoriesResult = await selectRows<SubcategoryLookupRecord>(
    asQuery(supabase.from("product_subcategories")).select("id, category_id, code, name"),
  );
  if (subcategoriesResult.error) {
    throw new Error(subcategoriesResult.error.message ?? "Failed to load subcategories.");
  }

  const subcategoryByCompositeCode = new Map<string, SubcategoryLookupRecord>();
  const subcategoryByCompositeName = new Map<string, SubcategoryLookupRecord>();
  for (const subcategory of subcategoriesResult.data) {
    const normalizedCode = normalizeCode(subcategory.code);
    const normalized = { ...subcategory, code: normalizedCode };
    subcategoryByCompositeCode.set(`${subcategory.category_id}:${normalizedCode}`, normalized);
    subcategoryByCompositeName.set(
      `${subcategory.category_id}:${normalizeTaxonomyName(subcategory.name)}`,
      normalized,
    );
  }

  const existingResult = await selectRows<ProductRecord>(
    asQuery(supabase.from("products")).select(
      "id, sku, barcode, name, description, unit, is_active, category_id, subcategory_id",
    ),
  );
  if (existingResult.error) {
    throw new Error(existingResult.error.message ?? "Failed to load products.");
  }

  const bySku = new Map<string, ProductRecord>();
  const byName = new Map<string, ProductRecord>();
  const byBarcode = new Map<string, ProductRecord>();

  for (const record of existingResult.data) {
    const normalizedSku = normalizeProductSku(record.sku);
    const normalized = { ...record, sku: normalizedSku };
    bySku.set(normalizedSku, normalized);
    byName.set(normalizeProductName(record.name), normalized);
    if (record.barcode) {
      const normalizedBarcode = normalizeBarcode(record.barcode);
      if (normalizedBarcode) {
        byBarcode.set(normalizedBarcode, normalized);
      }
    }
  }

  for (const row of rows) {
    const category = resolveCategory(row, categoryByCode, categoryByName);
    if (!category || !category.id) {
      const label = row.value.category_name ?? row.value.category_code ?? "unknown";
      const field = row.value.category_name ? "Category name" : "Category code";
      addRejectedRow(rejectedRows, row, `${field} "${label}" does not exist.`);
      continue;
    }

    const subcategory = resolveSubcategory(
      row,
      category.id,
      subcategoryByCompositeCode,
      subcategoryByCompositeName,
    );
    if (!subcategory || !subcategory.id) {
      const categoryLabel = row.value.category_name ?? row.value.category_code ?? category.name;
      const subcategoryLabel =
        row.value.subcategory_name ?? row.value.subcategory_code ?? "unknown";
      const field = row.value.subcategory_name ? "Subcategory name" : "Subcategory code";
      addRejectedRow(
        rejectedRows,
        row,
        `${field} "${subcategoryLabel}" does not exist under category "${categoryLabel}".`,
      );
      continue;
    }

    const normalizedName = normalizeProductName(row.value.name);
    const normalizedBarcode = row.value.barcode ? normalizeBarcode(row.value.barcode) : null;

    const existingBySku = row.value.sku ? bySku.get(row.value.sku) : undefined;
    const existingByName = byName.get(normalizedName);
    const existingByBarcode = normalizedBarcode ? byBarcode.get(normalizedBarcode) : undefined;

    if (
      !row.value.sku &&
      existingByName &&
      existingByBarcode &&
      existingByName.id !== existingByBarcode.id
    ) {
      addRejectedRow(
        rejectedRows,
        row,
        "Product name and barcode match different existing products.",
      );
      continue;
    }

    const existing =
      existingBySku ?? (!row.value.sku ? existingByName ?? existingByBarcode : undefined);

    if (existingByName && existingByName.id !== existing?.id) {
      addRejectedRow(rejectedRows, row, "Product name already exists.");
      continue;
    }

    if (normalizedBarcode && existingByBarcode && existingByBarcode.id !== existing?.id) {
      addRejectedRow(rejectedRows, row, "Product barcode already exists.");
      continue;
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
            category_id: category.id,
            subcategory_id: subcategory.id,
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

      const updated = {
        ...updateResult.data,
        sku: normalizeProductSku(updateResult.data.sku),
      };
      const oldName = normalizeProductName(existing.name);
      if (oldName !== normalizedName && byName.get(oldName)?.id === existing.id) {
        byName.delete(oldName);
      }
      byName.set(normalizedName, updated);

      const oldBarcode = existing.barcode ? normalizeBarcode(existing.barcode) : null;
      if (oldBarcode && oldBarcode !== normalizedBarcode && byBarcode.get(oldBarcode)?.id === existing.id) {
        byBarcode.delete(oldBarcode);
      }
      if (normalizedBarcode) {
        byBarcode.set(normalizedBarcode, updated);
      }

      bySku.set(updated.sku, updated);
      counters.updated_count += 1;
      continue;
    }

    if (row.value.sku) {
      const insertResult = await selectSingle<ProductRecord>(
        asQuery(supabase.from("products"))
          .insert({
            sku: row.value.sku,
            name: row.value.name,
            barcode: row.value.barcode,
            description: row.value.description,
            unit: row.value.unit,
            is_active: row.value.is_active,
            category_id: category.id,
            subcategory_id: subcategory.id,
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

      const inserted = {
        ...insertResult.data,
        sku: normalizeProductSku(insertResult.data.sku),
      };
      bySku.set(inserted.sku, inserted);
      byName.set(normalizedName, inserted);
      if (normalizedBarcode) {
        byBarcode.set(normalizedBarcode, inserted);
      }
      counters.inserted_count += 1;
      continue;
    }

    if (!supabase.rpc) {
      addRejectedRow(rejectedRows, row, "Failed to allocate SKU.");
      continue;
    }

    const created = await createProductWithGeneratedSku(supabase as Parameters<
      typeof createProductWithGeneratedSku
    >[0], {
      name: row.value.name,
      barcode: row.value.barcode,
      description: row.value.description,
      unit: row.value.unit,
      is_active: row.value.is_active,
      category_id: category.id,
      subcategory_id: subcategory.id,
    });

    if (created.error || !created.data) {
      addRejectedRow(rejectedRows, row, created.error ?? "Failed to insert product.");
      continue;
    }

    const createdRecord = created.data as ProductRecord;
    const inserted = {
      ...createdRecord,
      sku: normalizeProductSku(String(createdRecord.sku)),
    };
    bySku.set(inserted.sku, inserted);
    byName.set(normalizedName, inserted);
    if (normalizedBarcode) {
      byBarcode.set(normalizedBarcode, inserted);
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
