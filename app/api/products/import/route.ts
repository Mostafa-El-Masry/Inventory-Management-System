import { assertMasterPermission, getAuthContext } from "@/lib/auth/permissions";
import { createProductWithGeneratedSku } from "@/lib/products/create";
import {
  parseProductImportCsv,
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_MAX_COUNT,
  ProductImportError,
} from "@/lib/products/import";
import { normalizeTaxonomyName } from "@/lib/products/taxonomy";
import { normalizeProductName } from "@/lib/products/uniqueness";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { productImportSchema } from "@/lib/validation";
import { fail, ok, parseBody } from "@/lib/utils/http";

type RejectedImportRow = {
  row_number: number;
  name: string;
  barcode: string | null;
  reason: string;
  first_row_number?: number;
  existing_product_id?: string | null;
};

function normalizeBarcode(barcode: string) {
  return barcode.trim().toLowerCase();
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (context instanceof Response) {
    return context;
  }

  const permissionError = assertMasterPermission(context, "products", "import");
  if (permissionError) {
    return permissionError;
  }
  const writeClient = context.profile.role === "admin" ? context.supabase : supabaseAdmin;

  const payload = await parseBody(request, productImportSchema);
  if ("error" in payload) {
    return payload.error;
  }

  let rows;
  try {
    rows = parseProductImportCsv(payload.data.csv);
  } catch (error) {
    if (error instanceof ProductImportError) {
      return fail(error.message, error.status, error.details);
    }
    return fail("Failed to parse CSV import payload.", 422);
  }

  const { count, error: countError } = await writeClient
    .from("products")
    .select("id", { count: "exact", head: true });
  if (countError) {
    return fail(countError.message, 400);
  }

  const currentCount = count ?? 0;
  if (currentCount >= PRODUCT_MAX_COUNT) {
    return fail(`Maximum product count (${PRODUCT_MAX_COUNT}) has already been reached.`, 409, {
      current_count: currentCount,
      max_products: PRODUCT_MAX_COUNT,
    });
  }

  const { data: existingRows, error: existingError } = await writeClient
    .from("products")
    .select("id, name, barcode");
  if (existingError) {
    return fail(existingError.message, 400);
  }

  const { data: categoryRows, error: categoryError } = await writeClient
    .from("product_categories")
    .select("id, name, is_active");
  if (categoryError) {
    return fail(categoryError.message, 400);
  }

  const { data: subcategoryRows, error: subcategoryError } = await writeClient
    .from("product_subcategories")
    .select("id, category_id, name, is_active");
  if (subcategoryError) {
    return fail(subcategoryError.message, 400);
  }

  const existingNames = new Map<string, { id: string }>();
  const existingBarcodes = new Map<string, { id: string }>();
  for (const row of (existingRows ?? []) as Array<{
    id: string;
    name: string;
    barcode: string | null;
  }>) {
    existingNames.set(normalizeProductName(row.name), { id: row.id });
    if (row.barcode) {
      const normalizedBarcode = normalizeBarcode(row.barcode);
      if (normalizedBarcode) {
        existingBarcodes.set(normalizedBarcode, { id: row.id });
      }
    }
  }

  const categoriesByName = new Map<
    string,
    { id: string; is_active: boolean }
  >();
  for (const row of (categoryRows ?? []) as Array<{
    id: string;
    name: string;
    is_active: boolean;
  }>) {
    categoriesByName.set(normalizeTaxonomyName(row.name), {
      id: row.id,
      is_active: row.is_active,
    });
  }

  const subcategoriesByCategoryAndName = new Map<
    string,
    { id: string; is_active: boolean }
  >();
  for (const row of (subcategoryRows ?? []) as Array<{
    id: string;
    category_id: string;
    name: string;
    is_active: boolean;
  }>) {
    const key = `${row.category_id}:${normalizeTaxonomyName(row.name)}`;
    subcategoriesByCategoryAndName.set(key, {
      id: row.id,
      is_active: row.is_active,
    });
  }

  const seenNameRows = new Map<string, number>();
  const seenBarcodeRows = new Map<string, number>();
  const rejectedRows: RejectedImportRow[] = [];

  let insertedCount = 0;

  for (const row of rows) {
    if (currentCount + insertedCount >= PRODUCT_MAX_COUNT) {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: `Max total products (${PRODUCT_MAX_COUNT}) reached.`,
      });
      continue;
    }

    const normalizedName = normalizeProductName(row.name);
    const firstNameRow = seenNameRows.get(normalizedName);
    if (typeof firstNameRow === "number") {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: "Duplicate name in CSV.",
        first_row_number: firstNameRow,
      });
      continue;
    }

    const existingNameConflict = existingNames.get(normalizedName);
    if (existingNameConflict) {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: "Name already exists in catalog.",
        existing_product_id: existingNameConflict.id,
      });
      continue;
    }

    let normalizedBarcode: string | null = null;
    if (row.barcode) {
      const candidate = normalizeBarcode(row.barcode);
      if (candidate) {
        normalizedBarcode = candidate;
      }
    }

    if (normalizedBarcode) {
      const firstBarcodeRow = seenBarcodeRows.get(normalizedBarcode);
      if (typeof firstBarcodeRow === "number") {
        rejectedRows.push({
          row_number: row.row_number,
          name: row.name,
          barcode: row.barcode,
          reason: "Duplicate barcode in CSV.",
          first_row_number: firstBarcodeRow,
        });
        continue;
      }

      const existingBarcodeConflict = existingBarcodes.get(normalizedBarcode);
      if (existingBarcodeConflict) {
        rejectedRows.push({
          row_number: row.row_number,
          name: row.name,
          barcode: row.barcode,
          reason: "Barcode already exists in catalog.",
          existing_product_id: existingBarcodeConflict.id,
        });
        continue;
      }
    }

    const category = categoriesByName.get(
      normalizeTaxonomyName(row.category_name),
    );
    if (!category) {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: `Category "${row.category_name}" does not exist in masters.`,
      });
      continue;
    }

    if (!category.is_active) {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: `Category "${row.category_name}" is archived.`,
      });
      continue;
    }

    const subcategory = subcategoriesByCategoryAndName.get(
      `${category.id}:${normalizeTaxonomyName(row.subcategory_name)}`,
    );
    if (!subcategory) {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: `Subcategory "${row.subcategory_name}" does not exist under category "${row.category_name}".`,
      });
      continue;
    }

    if (!subcategory.is_active) {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: `Subcategory "${row.subcategory_name}" is archived.`,
      });
      continue;
    }

    const created = await createProductWithGeneratedSku(writeClient, {
      name: row.name.trim(),
      barcode: row.barcode,
      description: row.description,
      unit: row.unit.trim(),
      is_active: row.is_active,
      category_id: category.id,
      subcategory_id: subcategory.id,
    });
    if (created.error) {
      rejectedRows.push({
        row_number: row.row_number,
        name: row.name,
        barcode: row.barcode,
        reason: created.error,
      });
      continue;
    }

    insertedCount += 1;
    seenNameRows.set(normalizedName, row.row_number);
    if (normalizedBarcode) {
      seenBarcodeRows.set(normalizedBarcode, row.row_number);
      existingBarcodes.set(normalizedBarcode, { id: "inserted-this-import" });
    }
    existingNames.set(normalizedName, { id: "inserted-this-import" });
  }

  const rejectedCount = rejectedRows.length;
  return ok(
    {
      inserted_count: insertedCount,
      rejected_count: rejectedCount,
      processed_count: rows.length,
      rejected_rows: rejectedRows,
      max_rows: PRODUCT_IMPORT_MAX_ROWS,
      max_products: PRODUCT_MAX_COUNT,
      current_count: currentCount + insertedCount,
    },
    insertedCount > 0 ? 201 : 200,
  );
}
