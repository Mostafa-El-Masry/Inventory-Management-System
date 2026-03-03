"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_MAX_COUNT,
} from "@/lib/products/import";

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  is_active: boolean;
  category_name?: string | null;
  subcategory_name?: string | null;
  can_hard_delete?: boolean;
};

type ProductCategory = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type ProductSubcategory = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type AuthMe = {
  capabilities: {
    canCreateProductMaster: boolean;
    canEditProductMaster: boolean;
    canArchiveProducts: boolean;
  };
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [capabilities, setCapabilities] = useState<AuthMe["capabilities"] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [showCreateRow, setShowCreateRow] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    category_id: "",
    subcategory_id: "",
    barcode: "",
    unit: "unit",
    is_active: true,
  });
  const [newCategory, setNewCategory] = useState({
    name: "",
    is_active: true,
  });
  const [newSubcategory, setNewSubcategory] = useState({
    category_id: "",
    name: "",
    is_active: true,
  });
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProducts = useCallback(async () => {
    const response = await fetch(
      `/api/products?include_inactive=${showInactive ? "true" : "false"}`,
      { cache: "no-store" },
    );
    const json = (await response.json()) as { items?: Product[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load products.");
      return;
    }
    setProducts(json.items ?? []);
  }, [showInactive]);

  const loadAuth = useCallback(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const json = (await response.json()) as AuthMe & { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load permissions.");
      return;
    }
    setCapabilities(json.capabilities);
  }, []);

  const loadTaxonomy = useCallback(async () => {
    setTaxonomyLoading(true);
    const [categoriesResponse, subcategoriesResponse] = await Promise.all([
      fetch("/api/product-categories", { cache: "no-store" }),
      fetch("/api/product-subcategories", { cache: "no-store" }),
    ]);

    const categoriesJson = (await categoriesResponse.json()) as {
      items?: ProductCategory[];
      error?: string;
    };
    if (!categoriesResponse.ok) {
      setError(categoriesJson.error ?? "Failed to load product categories.");
      setTaxonomyLoading(false);
      return;
    }

    const subcategoriesJson = (await subcategoriesResponse.json()) as {
      items?: ProductSubcategory[];
      error?: string;
    };
    if (!subcategoriesResponse.ok) {
      setError(subcategoriesJson.error ?? "Failed to load product subcategories.");
      setTaxonomyLoading(false);
      return;
    }

    const loadedCategories = categoriesJson.items ?? [];
    const loadedSubcategories = subcategoriesJson.items ?? [];
    setCategories(loadedCategories);
    setSubcategories(loadedSubcategories);
    setTaxonomyLoading(false);
  }, []);

  useEffect(() => {
    loadAuth().catch(() => setError("Failed to load product data."));
  }, [loadAuth]);

  useEffect(() => {
    loadProducts().catch(() => setError("Failed to load products."));
  }, [loadProducts]);

  const canCreateProductMaster = capabilities?.canCreateProductMaster ?? false;

  useEffect(() => {
    if (!canCreateProductMaster) {
      return;
    }
    loadTaxonomy().catch(() => setError("Failed to load product taxonomy."));
  }, [canCreateProductMaster, loadTaxonomy]);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  );
  const createRowSubcategories = useMemo(
    () =>
      subcategories.filter(
        (subcategory) =>
          subcategory.category_id === newProduct.category_id &&
          subcategory.is_active,
      ),
    [subcategories, newProduct.category_id],
  );

  const canCreateProduct =
    newProduct.name.trim().length >= 2 &&
    newProduct.unit.trim().length >= 1 &&
    newProduct.category_id.length > 0 &&
    newProduct.subcategory_id.length > 0;

  const canCreateCategory = newCategory.name.trim().length >= 2;
  const canCreateSubcategory =
    newSubcategory.name.trim().length >= 2 &&
    newSubcategory.category_id.length > 0;

  async function createProduct() {
    if (!canCreateProductMaster || !canCreateProduct) {
      return;
    }

    setCreateLoading(true);
    setError(null);
    const payload = {
      name: newProduct.name.trim(),
      category_id: newProduct.category_id,
      subcategory_id: newProduct.subcategory_id,
      barcode: newProduct.barcode.trim() || null,
      unit: newProduct.unit.trim(),
      description: null,
      is_active: newProduct.is_active,
    };

    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create product.");
      setCreateLoading(false);
      return;
    }

    setNewProduct({
      name: "",
      category_id: "",
      subcategory_id: "",
      barcode: "",
      unit: "unit",
      is_active: true,
    });
    await loadProducts();
    setCreateLoading(false);
  }

  async function createCategory() {
    if (!canCreateProductMaster || !canCreateCategory) {
      return;
    }

    setTaxonomySaving(true);
    setError(null);
    const response = await fetch("/api/product-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCategory.name.trim(),
        is_active: newCategory.is_active,
      }),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create category.");
      setTaxonomySaving(false);
      return;
    }

    setNewCategory({
      name: "",
      is_active: true,
    });
    await loadTaxonomy();
    setTaxonomySaving(false);
  }

  async function createSubcategory() {
    if (!canCreateProductMaster || !canCreateSubcategory) {
      return;
    }

    setTaxonomySaving(true);
    setError(null);
    const response = await fetch("/api/product-subcategories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: newSubcategory.category_id,
        name: newSubcategory.name.trim(),
        is_active: newSubcategory.is_active,
      }),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create subcategory.");
      setTaxonomySaving(false);
      return;
    }

    setNewSubcategory((current) => ({
      ...current,
      name: "",
      is_active: true,
    }));
    await loadTaxonomy();
    setTaxonomySaving(false);
  }

  async function importProductsFromCsv() {
    if (!canCreateProductMaster || !importFile) {
      return;
    }

    setImportLoading(true);
    setImportMessage(null);
    setError(null);

    let csvText = "";
    try {
      csvText = await importFile.text();
    } catch {
      setError("Failed to read the selected CSV file.");
      setImportLoading(false);
      return;
    }

    const response = await fetch("/api/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
    });

    const json = (await response.json()) as {
      error?: string;
      inserted_count?: number;
      processed_count?: number;
      rejected_count?: number;
      rejected_rows?: Array<{
        row_number: number;
        name: string;
        reason: string;
      }>;
      details?: {
        barcodes?: string[];
        names?: Array<
          | string
          | {
              name?: string;
              row_number?: number;
              first_row_number?: number;
            }
        >;
      };
    };

    if (!response.ok) {
      const duplicateBarcodes = json.details?.barcodes ?? [];
      const duplicateNames = json.details?.names ?? [];
      const hasNameDetails = duplicateNames.length > 0;
      const hasBarcodeDetails = duplicateBarcodes.length > 0;

      if (hasNameDetails || hasBarcodeDetails) {
        const nameDetails = duplicateNames
          .map((entry) => {
            if (typeof entry === "string") {
              return entry;
            }

            const entryName = entry.name ?? "Unnamed";
            if (typeof entry.row_number === "number") {
              return `${entryName} (row ${entry.row_number})`;
            }

            return entryName;
          })
          .join(", ");

        const parts = [json.error ?? "Product import failed."];
        if (hasNameDetails) {
          parts.push(`Names: ${nameDetails}`);
        }
        if (hasBarcodeDetails) {
          parts.push(`Barcodes: ${duplicateBarcodes.join(", ")}`);
        }
        setError(parts.join(" "));
      } else {
        setError(json.error ?? "Product import failed.");
      }
      setImportLoading(false);
      return;
    }

    const inserted = json.inserted_count ?? 0;
    const processed = json.processed_count ?? inserted;
    const rejected = json.rejected_count ?? 0;
    const preview = (json.rejected_rows ?? [])
      .slice(0, 3)
      .map((row) => `row ${row.row_number} (${row.name}): ${row.reason}`)
      .join("; ");

    setImportMessage(
      rejected > 0
        ? `Import completed: ${inserted} inserted, ${rejected} rejected out of ${processed}. ${preview}`
        : `Import completed: ${inserted} of ${processed} product row(s) inserted.`,
    );

    setImportFile(null);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }

    await loadProducts();
    setImportLoading(false);
  }

  async function setProductActive(productId: string, active: boolean) {
    setStateLoading(true);
    setError(null);
    const endpoint = active ? "activate" : "archive";
    const response = await fetch(`/api/products/${productId}/${endpoint}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${endpoint} product.`);
      setStateLoading(false);
      return;
    }

    await loadProducts();
    setStateLoading(false);
  }

  async function hardDeleteProduct(product: Product) {
    const confirmed = confirm(
      `Hard delete product "${product.name}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setStateLoading(true);
    setError(null);
    const response = await fetch(`/api/products/${product.id}/hard-delete`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to hard delete product.");
      setStateLoading(false);
      return;
    }

    await loadProducts();
    setStateLoading(false);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="ims-kicker">Master Data</p>
        <h1 className="ims-title text-[2.1rem]">Products</h1>
        <p className="ims-subtitle">Product master is admin-managed.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {importMessage ? <p className="ims-alert-success">{importMessage}</p> : null}

      {canCreateProductMaster ? (
        <Card className="min-h-[12rem]">
          <h2 className="text-lg font-semibold">Bulk Import</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Download the product CSV template, fill rows, then upload to import products in
            bulk.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Required columns include <code>name</code>, <code>category_name</code>,{" "}
            <code>subcategory_name</code>, and <code>unit</code>.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Max rows per import: {PRODUCT_IMPORT_MAX_ROWS}. Max total products:{" "}
            {PRODUCT_MAX_COUNT}.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href="/api/products/import/template">
              <Button variant="secondary" className="h-11 rounded-2xl">
                Download Template
              </Button>
            </a>

            <Input
              ref={importFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="h-11 w-full max-w-xl"
              onChange={(event) => {
                setImportMessage(null);
                setImportFile(event.target.files?.[0] ?? null);
              }}
            />

            <Button
              className="h-11 rounded-2xl"
              onClick={() => importProductsFromCsv()}
              disabled={importLoading || !importFile}
            >
              {importLoading ? "Importing..." : "Import CSV"}
            </Button>
          </div>
        </Card>
      ) : null}

      {canCreateProductMaster ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Category and Subcategory Masters</h2>
            <span className="text-xs text-[var(--text-muted)]">
              {taxonomyLoading ? "Refreshing masters..." : `${categories.length} categories`}
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <h3 className="text-sm font-semibold">Categories</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newCategory.name}
                  placeholder="Category name"
                  className="h-10 flex-1"
                  onChange={(event) =>
                    setNewCategory((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newCategory.is_active}
                    onChange={(event) =>
                      setNewCategory((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Active
                </label>
                <Button
                  className="h-10"
                  disabled={!canCreateCategory || taxonomySaving}
                  onClick={() => createCategory()}
                >
                  Add
                </Button>
              </div>
              <div className="max-h-[12rem] space-y-1 overflow-auto text-sm">
                {categories.map((category) => (
                  <p key={category.id} className="text-[var(--text-muted)]">
                    {category.code} - {category.name}{" "}
                    {category.is_active ? "" : "(archived)"}
                  </p>
                ))}
                {categories.length === 0 ? (
                  <p className="text-[var(--text-muted)]">No categories yet.</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <h3 className="text-sm font-semibold">Subcategories</h3>
              <div className="flex flex-col gap-2">
                <Select
                  className="h-10"
                  value={newSubcategory.category_id}
                  onChange={(event) =>
                    setNewSubcategory((current) => ({
                      ...current,
                      category_id: event.target.value,
                    }))
                  }
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.code} - {category.name}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={newSubcategory.name}
                    placeholder="Subcategory name"
                    className="h-10 flex-1"
                    onChange={(event) =>
                      setNewSubcategory((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newSubcategory.is_active}
                      onChange={(event) =>
                        setNewSubcategory((current) => ({
                          ...current,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    Active
                  </label>
                  <Button
                    className="h-10"
                    disabled={!canCreateSubcategory || taxonomySaving}
                    onClick={() => createSubcategory()}
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="max-h-[12rem] space-y-1 overflow-auto text-sm">
                {subcategories.map((subcategory) => {
                  const category = categories.find(
                    (item) => item.id === subcategory.category_id,
                  );
                  return (
                    <p key={subcategory.id} className="text-[var(--text-muted)]">
                      {(category?.code ?? "--")}-{subcategory.code} - {subcategory.name}{" "}
                      {subcategory.is_active ? "" : "(archived)"}
                    </p>
                  );
                })}
                {subcategories.length === 0 ? (
                  <p className="text-[var(--text-muted)]">No subcategories yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <section>
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Product List</h2>
            <div className="flex flex-wrap items-center gap-2">
              {canCreateProductMaster ? (
                <Button
                  variant="secondary"
                  className="h-9 w-9 rounded-full p-0 text-lg leading-none"
                  aria-label={showCreateRow ? "Hide product create row" : "Show product create row"}
                  onClick={() => setShowCreateRow((current) => !current)}
                >
                  {showCreateRow ? "X" : "+"}
                </Button>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                />
                Show archived
              </label>
            </div>
          </div>

          <div className="mt-4 max-h-[36rem] overflow-auto">
            <table className="ims-table">
              <thead className="ims-table-head">
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th>Barcode</th>
                  <th>Unit</th>
                  <th>Active</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {canCreateProductMaster && showCreateRow ? (
                  <tr className="ims-table-row">
                    <td className="font-medium text-[var(--text-muted)]">Auto</td>
                    <td>
                      <Input
                        value={newProduct.name}
                        onChange={(event) =>
                          setNewProduct((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Product name"
                        className="h-9"
                      />
                    </td>
                    <td>
                      <Select
                        className="h-9"
                        value={newProduct.category_id}
                        onChange={(event) =>
                          setNewProduct((current) => ({
                            ...current,
                            category_id: event.target.value,
                            subcategory_id:
                              current.category_id === event.target.value
                                ? current.subcategory_id
                                : "",
                          }))
                        }
                      >
                        <option value="">Select category</option>
                        {activeCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.code} - {category.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Select
                        className="h-9"
                        value={newProduct.subcategory_id}
                        onChange={(event) =>
                          setNewProduct((current) => ({
                            ...current,
                            subcategory_id: event.target.value,
                          }))
                        }
                        disabled={!newProduct.category_id}
                      >
                        <option value="">Select subcategory</option>
                        {createRowSubcategories.map((subcategory) => (
                          <option key={subcategory.id} value={subcategory.id}>
                            {subcategory.code} - {subcategory.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Input
                        value={newProduct.barcode}
                        onChange={(event) =>
                          setNewProduct((current) => ({
                            ...current,
                            barcode: event.target.value,
                          }))
                        }
                        placeholder="Barcode"
                        className="h-9"
                      />
                    </td>
                    <td>
                      <Input
                        value={newProduct.unit}
                        onChange={(event) =>
                          setNewProduct((current) => ({
                            ...current,
                            unit: event.target.value,
                          }))
                        }
                        placeholder="Unit"
                        className="h-9"
                      />
                    </td>
                    <td>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={newProduct.is_active}
                          onChange={(event) =>
                            setNewProduct((current) => ({
                              ...current,
                              is_active: event.target.checked,
                            }))
                          }
                        />
                        {newProduct.is_active ? "Yes" : "No"}
                      </label>
                    </td>
                    <td>
                      <Button
                        className="h-9"
                        disabled={!canCreateProduct || createLoading || taxonomyLoading}
                        onClick={() => createProduct()}
                      >
                        {createLoading ? "Saving..." : "Create"}
                      </Button>
                    </td>
                  </tr>
                ) : null}
                {products.map((product) => (
                  <tr key={product.id} className="ims-table-row">
                    <td className="font-medium">{product.sku}</td>
                    <td>{product.name}</td>
                    <td>{product.category_name ?? "-"}</td>
                    <td>{product.subcategory_name ?? "-"}</td>
                    <td>{product.barcode ?? "-"}</td>
                    <td>{product.unit}</td>
                    <td>{product.is_active ? "Yes" : "No"}</td>
                    <td>
                      {capabilities?.canArchiveProducts ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {product.is_active ? (
                            <Button
                              variant="secondary"
                              className="h-9"
                              disabled={stateLoading}
                              onClick={() => setProductActive(product.id, false)}
                            >
                              Archive
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              className="h-9"
                              disabled={stateLoading}
                              onClick={() => setProductActive(product.id, true)}
                            >
                              Activate
                            </Button>
                          )}
                          {product.can_hard_delete ? (
                            <Button
                              variant="danger"
                              className="h-9"
                              disabled={stateLoading}
                              onClick={() => hardDeleteProduct(product)}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">restricted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 ? (
              <p className="ims-empty mt-3">No products found.</p>
            ) : null}
            {capabilities === null ? (
              <p className="ims-empty mt-3">Loading permissions...</p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
