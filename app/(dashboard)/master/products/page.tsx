"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { MasterPageHeader } from "@/components/master/master-page-header";
import { MasterCsvSync } from "@/components/master/master-csv-sync";
import { MasterListSettingsMenu } from "@/components/master/master-list-settings-menu";
import { MasterPanelReveal } from "@/components/master/master-panel-reveal";
import { MasterTableLoadingRows } from "@/components/master/master-table-loading";
import {
  MasterRowLimitControl,
  MasterTablePagination,
  RowLimitOption,
  paginateRows,
  parseRowLimitOption,
} from "@/components/master/master-table-pagination";
import {
  SortDirection,
  SortableTableHeader,
} from "@/components/master/sortable-table-header";
import {
  buildDefaultColumnVisibility,
  useMasterColumns,
} from "@/components/master/use-master-columns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { Select } from "@/components/ui/select";
import type { ExportColumn } from "@/lib/export/contracts";
import {
  buildFilterStorageKey,
  readLocalFilterState,
  removeLocalFilterState,
  writeLocalFilterState,
} from "@/lib/utils/local-filter-storage";
import { compareTextValues } from "@/lib/utils/sort-values";
import { fetchJson } from "@/lib/utils/fetch-json";

const PRODUCT_COLUMN_DEFINITIONS = [
  { key: "name", label: "Name" },
  { key: "barcode", label: "Barcode" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "subcategory", label: "Subcategory" },
  { key: "unit", label: "Unit" },
  { key: "active", label: "Active" },
  { key: "action", label: "Action" },
] as const;

type ProductColumnKey = (typeof PRODUCT_COLUMN_DEFINITIONS)[number]["key"];

const DEFAULT_PRODUCT_COLUMN_ORDER: ProductColumnKey[] = [
  "name",
  "barcode",
  "sku",
  "category",
  "subcategory",
  "unit",
  "active",
  "action",
];

const DEFAULT_PRODUCT_COLUMN_VISIBILITY = buildDefaultColumnVisibility(
  DEFAULT_PRODUCT_COLUMN_ORDER,
  ["name", "barcode"],
);

const PRODUCT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "sku", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "barcode", label: "Barcode" },
  { key: "unit", label: "Unit" },
  { key: "is_active", label: "Active" },
  { key: "description", label: "Description" },
  { key: "category_code", label: "Category SKU" },
  { key: "subcategory_code", label: "Subcategory SKU" },
];

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description?: string | null;
  unit: string;
  is_active: boolean;
  category_code?: string | null;
  category_name?: string | null;
  subcategory_code?: string | null;
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

type ProductSortKey = Exclude<ProductColumnKey, "action">;

function isProductSortableColumn(key: ProductColumnKey): key is ProductSortKey {
  return key !== "action";
}

export default function ProductsPage() {
  const { capabilities, userId: authUserId } = useDashboardSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [masterPanelOpen, setMasterPanelOpen] = useState(false);
  const [productRowLimit, setProductRowLimit] = useState<RowLimitOption>(10);
  const [productRowLimitPrefsLoaded, setProductRowLimitPrefsLoaded] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [archivedFilterHydrated, setArchivedFilterHydrated] = useState(false);
  const [productSortKey, setProductSortKey] = useState<ProductSortKey>("name");
  const [productSortDirection, setProductSortDirection] =
    useState<SortDirection>("asc");
  const [newProduct, setNewProduct] = useState({
    name: "",
    category_id: "",
    subcategory_id: "",
    barcode: "",
    unit: "unit",
    is_active: true,
  });
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const archivedFilterStorageKey = buildFilterStorageKey(authUserId, "master", "products");
  const {
    orderedColumns,
    visibleColumns,
    columnVisibility,
    toggleColumnVisibility,
    moveColumn,
    resetColumnPreferences,
  } = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:products:columns:${authUserId}`,
    columns: PRODUCT_COLUMN_DEFINITIONS,
    defaultOrder: DEFAULT_PRODUCT_COLUMN_ORDER,
    defaultVisibility: DEFAULT_PRODUCT_COLUMN_VISIBILITY,
  });

  const loadProducts = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchJson<{ items?: Product[] }>(
      `/api/products?include_inactive=${showInactive ? "true" : "false"}`,
      {
        cache: "no-store",
        signal,
        fallbackError: "Failed to load products.",
      },
    );
    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setError(null);
    setProducts(result.data.items ?? []);
  }, [showInactive]);

  const loadTaxonomy = useCallback(async (signal?: AbortSignal) => {
    setTaxonomyLoading(true);
    try {
      const [categoriesResult, subcategoriesResult] = await Promise.all([
        fetchJson<{ items?: ProductCategory[] }>("/api/product-categories", {
          cache: "no-store",
          signal,
          fallbackError: "Failed to load product categories.",
        }),
        fetchJson<{ items?: ProductSubcategory[] }>("/api/product-subcategories", {
          cache: "no-store",
          signal,
          fallbackError: "Failed to load product subcategories.",
        }),
      ]);

      if (!categoriesResult.ok) {
        if (categoriesResult.error !== "Request aborted.") {
          setError(categoriesResult.error);
        }
        return;
      }

      if (!subcategoriesResult.ok) {
        if (subcategoriesResult.error !== "Request aborted.") {
          setError(subcategoriesResult.error);
        }
        return;
      }

      setCategories(categoriesResult.data.items ?? []);
      setSubcategories(subcategoriesResult.data.items ?? []);
    } finally {
      setTaxonomyLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = readLocalFilterState<{ showInactive?: boolean }>(archivedFilterStorageKey);
    setShowInactive(saved?.showInactive === true);
    setArchivedFilterHydrated(true);
  }, [archivedFilterStorageKey]);

  useEffect(() => {
    if (!archivedFilterHydrated) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setProductsLoading(true);
    loadProducts(controller.signal)
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load products.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProductsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [archivedFilterHydrated, loadProducts]);

  const canCreateProductPermission = capabilities.master.products.create;
  const canImportProducts = capabilities.master.products.import;
  const canArchiveProducts = capabilities.master.products.archive;
  const canDeleteProducts = capabilities.master.products.delete;
  const canShowProductPanel = canCreateProductPermission || canImportProducts;
  const needsTaxonomyForPanel = canCreateProductPermission;
  const showProductLoadingRows = !archivedFilterHydrated || productsLoading;

  useEffect(() => {
    if (!canShowProductPanel) {
      setMasterPanelOpen(false);
    }
  }, [canShowProductPanel]);

  useEffect(() => {
    if (!needsTaxonomyForPanel) {
      return;
    }
    const controller = new AbortController();
    loadTaxonomy(controller.signal).catch(() => setError("Failed to load product taxonomy."));
    return () => controller.abort();
  }, [loadTaxonomy, needsTaxonomyForPanel]);

  useEffect(() => {
    if (!authUserId) {
      setProductRowLimitPrefsLoaded(false);
      return;
    }

    setProductRowLimitPrefsLoaded(false);
    const storageKey = `ims:products:row-limit:${authUserId}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setProductRowLimit(10);
        setProductRowLimitPrefsLoaded(true);
        return;
      }

      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Keep raw string for parser.
      }

      setProductRowLimit(parseRowLimitOption(parsed));
      setProductRowLimitPrefsLoaded(true);
    } catch {
      setProductRowLimit(10);
      setProductRowLimitPrefsLoaded(true);
    }
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || !productRowLimitPrefsLoaded) {
      return;
    }

    const storageKey = `ims:products:row-limit:${authUserId}`;
    try {
      window.localStorage.setItem(storageKey, String(productRowLimit));
    } catch {
      // Ignore localStorage quota or privacy-mode write errors.
    }
  }, [authUserId, productRowLimitPrefsLoaded, productRowLimit]);

  useEffect(() => {
    setProductPage(1);
  }, [productRowLimit, productSortDirection, productSortKey, showInactive]);

  useEffect(() => {
    if (!archivedFilterHydrated) {
      return;
    }

    if (!showInactive) {
      removeLocalFilterState(archivedFilterStorageKey);
      return;
    }

    writeLocalFilterState(archivedFilterStorageKey, { showInactive: true });
  }, [archivedFilterHydrated, archivedFilterStorageKey, showInactive]);

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

  const canCreateProductForm =
    newProduct.name.trim().length >= 2 &&
    newProduct.unit.trim().length >= 1 &&
    newProduct.category_id.length > 0 &&
    newProduct.subcategory_id.length > 0;
  const sortedProducts = useMemo(() => {
    const next = [...products];
    next.sort((left, right) => {
      switch (productSortKey) {
        case "name":
          return compareTextValues(left.name, right.name, productSortDirection);
        case "barcode":
          return compareTextValues(left.barcode, right.barcode, productSortDirection);
        case "sku":
          return compareTextValues(left.sku, right.sku, productSortDirection);
        case "category":
          return compareTextValues(
            left.category_name ?? left.category_code,
            right.category_name ?? right.category_code,
            productSortDirection,
          );
        case "subcategory":
          return compareTextValues(
            left.subcategory_name ?? left.subcategory_code,
            right.subcategory_name ?? right.subcategory_code,
            productSortDirection,
          );
        case "unit":
          return compareTextValues(left.unit, right.unit, productSortDirection);
        case "active":
          return compareTextValues(left.is_active, right.is_active, productSortDirection);
      }
    });
    return next;
  }, [productSortDirection, productSortKey, products]);
  const productPagination = useMemo(
    () => paginateRows(sortedProducts, productRowLimit, productPage),
    [productPage, productRowLimit, sortedProducts],
  );
  const visibleProducts = productPagination.items;
  const productExportRows = products.map((product) => ({
    sku: product.sku,
    name: product.name,
    barcode: product.barcode ?? "",
    unit: product.unit,
    is_active: product.is_active,
    description: product.description ?? "",
    category_code: product.category_code ?? "",
    subcategory_code: product.subcategory_code ?? "",
  }));
  const productFilterSummary = [`Inactive included: ${showInactive ? "Yes" : "No"}`];

  useEffect(() => {
    if (productPage > productPagination.totalPages) {
      setProductPage(productPagination.totalPages);
    }
  }, [productPage, productPagination.totalPages]);

  function toggleProductSort(nextKey: ProductSortKey) {
    setProductSortDirection((current) =>
      productSortKey === nextKey ? (current === "asc" ? "desc" : "asc") : "asc",
    );
    setProductSortKey(nextKey);
  }

  async function createProduct() {
    if (!canCreateProductPermission || !canCreateProductForm) {
      return;
    }

    setCreateLoading(true);
    setError(null);
    try {
      const payload = {
        name: newProduct.name.trim(),
        category_id: newProduct.category_id,
        subcategory_id: newProduct.subcategory_id,
        barcode: newProduct.barcode.trim() || null,
        unit: newProduct.unit.trim(),
        description: null,
        is_active: newProduct.is_active,
      };

      const result = await fetchJson<{ error?: string }>("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackError: "Failed to create product.",
      });

      if (!result.ok) {
        setError(result.error);
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
    } finally {
      setCreateLoading(false);
    }
  }

  async function importProductsFromCsv() {
    if (!canImportProducts || !importFile) {
      return;
    }

    setImportLoading(true);
    setImportMessage(null);
    setImportErrors([]);
    setError(null);

    let csvText = "";
    try {
      csvText = await importFile.text();
    } catch {
      setImportErrors(["Failed to read the selected CSV file."]);
      setImportLoading(false);
      return;
    }

    type ProductImportResponse = {
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

    const result = await fetchJson<ProductImportResponse>("/api/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
      fallbackError: "Product import failed.",
    });

    const json: ProductImportResponse = result.data ?? {};

    if (!result.ok) {
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
        setImportErrors(parts);
      } else {
        setImportErrors([json.error ?? result.error]);
      }
      setImportLoading(false);
      return;
    }

    const inserted = json.inserted_count ?? 0;
    const processed = json.processed_count ?? inserted;
    const rejected = json.rejected_count ?? 0;
    const rejectedPreviewRows = (json.rejected_rows ?? []).slice(0, 3);
    const skippedErrors = rejectedPreviewRows.map(
      (row) => `Row ${row.row_number} (${row.name}): ${row.reason}`,
    );
    const remainingRejectedCount = Math.max(rejected - rejectedPreviewRows.length, 0);

    setImportMessage(
      inserted > 0 ? `Upload completed: ${inserted} of ${processed} product row(s) inserted.` : null,
    );
    setImportErrors(
      rejected > 0
        ? [
            `Skipped ${rejected} row(s) out of ${processed}.`,
            ...skippedErrors,
            remainingRejectedCount > 0
              ? `Showing first ${rejectedPreviewRows.length} errors.`
              : "",
          ].filter(Boolean)
        : [],
    );

    setImportFile(null);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }

    await loadProducts();
    setImportLoading(false);
  }

  async function setProductActive(productId: string, active: boolean) {
    if (!canArchiveProducts) {
      return;
    }

    setStateLoading(true);
    setError(null);
    try {
      const endpoint = active ? "activate" : "archive";
      const result = await fetchJson<{ error?: string }>(
        `/api/products/${productId}/${endpoint}`,
        {
          method: "POST",
          fallbackError: `Failed to ${endpoint} product.`,
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      await loadProducts();
    } finally {
      setStateLoading(false);
    }
  }

  async function hardDeleteProduct(product: Product) {
    if (!canDeleteProducts) {
      return;
    }

    const confirmed = confirm(
      `Hard delete product "${product.name}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setStateLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/products/${product.id}/hard-delete`,
        {
          method: "POST",
          fallbackError: "Failed to hard delete product.",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      await loadProducts();
    } finally {
      setStateLoading(false);
    }
  }

  function renderProductCell(product: Product, columnKey: ProductColumnKey) {
    if (columnKey === "sku") {
      return <span className="font-medium">{product.sku}</span>;
    }

    if (columnKey === "name") {
      return (
        <span className="ims-product-name-text" title={product.name}>
          {product.name}
        </span>
      );
    }

    if (columnKey === "category") {
      return product.category_name ?? "-";
    }

    if (columnKey === "subcategory") {
      return product.subcategory_name ?? "-";
    }

    if (columnKey === "barcode") {
      return product.barcode ?? "-";
    }

    if (columnKey === "unit") {
      return product.unit;
    }

    if (columnKey === "active") {
      return product.is_active ? "Yes" : "No";
    }

    if (columnKey === "action") {
      const actionItems = [];

      if (canArchiveProducts) {
        actionItems.push({
          label: product.is_active ? "Archive" : "Activate",
          onSelect: () => setProductActive(product.id, !product.is_active),
        });
      }

      if (canDeleteProducts && product.can_hard_delete) {
        actionItems.push({
          label: "Delete",
          destructive: true,
          onSelect: () => hardDeleteProduct(product),
        });
      }

      if (actionItems.length === 0) {
        return <span className="text-xs text-[var(--text-muted)]">--</span>;
      }

      return (
        <RowActionsMenu
          label={`Open actions for ${product.name}`}
          disabled={stateLoading}
          items={actionItems}
        />
      );
    }

    return null;
  }

  return (
    <div className="space-y-6">
      <MasterPageHeader
        title="Products"
        showAction={canShowProductPanel}
        panelOpen={masterPanelOpen}
        onTogglePanel={canShowProductPanel ? () => setMasterPanelOpen((current) => !current) : undefined}
        openLabel="Show product actions"
        closeLabel="Hide product actions"
      />

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {importMessage ? <p className="ims-alert-success">{importMessage}</p> : null}
      {importErrors.length > 0 ? (
        <div className="ims-alert-danger space-y-1">
          {importErrors.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      ) : null}

      {canShowProductPanel ? (
        <MasterPanelReveal open={masterPanelOpen} className="space-y-4">
          <MasterCsvSync
            entity="products"
            canManage={canImportProducts}
            showDefaultImportControls={false}
            onImported={async () => {
              await loadProducts();
            }}
            secondaryActions={canImportProducts ? (
              <div className="flex flex-wrap items-center gap-3">
                <a href="/api/products/import/template">
                  <Button variant="secondary" className="ims-control-lg rounded-2xl">
                    Download Import Template
                  </Button>
                </a>

                <FilePicker
                  ref={importFileInputRef}
                  accept=".csv,text/csv"
                  fileName={importFile?.name ?? null}
                  className="ims-control-lg w-full max-w-xl"
                  onChange={(event) => {
                    setImportMessage(null);
                    setImportErrors([]);
                    setImportFile(event.target.files?.[0] ?? null);
                  }}
                />

                <Button
                  className="ims-control-lg rounded-2xl"
                  onClick={() => importProductsFromCsv()}
                  disabled={importLoading || !importFile}
                >
                  {importLoading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            ) : null}
          >
            {canCreateProductPermission ? (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1">
                <label className="ims-field-label mb-0">Product name</label>
                <Input
                  value={newProduct.name}
                  onChange={(event) =>
                    setNewProduct((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Product name"
                  className="ims-control-md"
                />
              </div>
              <div className="space-y-1">
                <label className="ims-field-label mb-0">Barcode</label>
                <Input
                  value={newProduct.barcode}
                  onChange={(event) =>
                    setNewProduct((current) => ({
                      ...current,
                      barcode: event.target.value,
                    }))
                  }
                  placeholder="Barcode"
                  className="ims-control-md"
                />
              </div>
              <div className="space-y-1">
                <label className="ims-field-label mb-0">Category</label>
                <Select
                  className="ims-control-md"
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
                  disabled={taxonomyLoading || activeCategories.length === 0}
                >
                  <option value="">Select category</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.code} - {category.name}
                    </option>
                  ))}
                </Select>
                {!taxonomyLoading && activeCategories.length === 0 ? (
                  <p className="ims-alert-warn mt-1 text-xs">
                    Create an active category first in Categories.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="ims-field-label mb-0">Subcategory</label>
                <Select
                  className="ims-control-md"
                  value={newProduct.subcategory_id}
                  onChange={(event) =>
                    setNewProduct((current) => ({
                      ...current,
                      subcategory_id: event.target.value,
                    }))
                  }
                  disabled={!newProduct.category_id || createRowSubcategories.length === 0}
                >
                  <option value="">Select subcategory</option>
                  {createRowSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>
                      {subcategory.code} - {subcategory.name}
                    </option>
                  ))}
                </Select>
                {newProduct.category_id &&
                !taxonomyLoading &&
                createRowSubcategories.length === 0 ? (
                  <p className="ims-alert-warn mt-1 text-xs">
                    This category has no active subcategories. Create one in Subcategories first.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="ims-field-label mb-0">Unit</label>
                <Input
                  value={newProduct.unit}
                  onChange={(event) =>
                    setNewProduct((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                  placeholder="Unit"
                  className="ims-control-md"
                />
              </div>
              <div className="flex items-end justify-between gap-3">
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
                  {newProduct.is_active ? "Active" : "Inactive"}
                </label>
                <Button
                  className="ims-control-md"
                  disabled={!canCreateProductForm || createLoading || taxonomyLoading}
                  onClick={() => createProduct()}
                >
                  {createLoading ? "Saving..." : "Create"}
                </Button>
              </div>
              </div>
            ) : null}
          </MasterCsvSync>
        </MasterPanelReveal>
      ) : null}

      {!canShowProductPanel ? (
        <MasterCsvSync
          entity="products"
          canManage={canImportProducts}
          onImported={async () => {
            await loadProducts();
          }}
        />
      ) : null}

      <section>
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
              <MasterRowLimitControl
                value={productRowLimit}
                onChange={(limit) => {
                  setProductRowLimit(limit);
                  setProductPage(1);
                }}
              />
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-semibold">Product List</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {showInactive ? "Showing active and disabled products." : "Showing active products only."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MasterListSettingsMenu
                orderedColumns={orderedColumns}
                columnVisibility={columnVisibility}
                onToggleColumn={toggleColumnVisibility}
                onMoveColumn={moveColumn}
                onResetColumns={resetColumnPreferences}
                columnsHelperText="Default view shows Name and Barcode only."
                showInactive={showInactive}
                onShowInactiveChange={(pressed) => setShowInactive(pressed)}
                inactiveLabel="Disabled"
                exportTitle="Products"
                exportFilenameBase="products"
                exportColumns={PRODUCT_EXPORT_COLUMNS}
                exportRows={productExportRows}
                exportFilterSummary={productFilterSummary}
                exportEmptyMessage="No products available."
              />
            </div>
          </div>

          <div className="mt-4 overflow-visible">
            <table
              className="ims-table ims-table-products"
              aria-busy={showProductLoadingRows}
            >
              <thead className="ims-table-head">
                <tr>
                  {visibleColumns.map((column) => (
                    <th key={column.key}>
                      {!isProductSortableColumn(column.key) ? column.label : (() => {
                        const sortKey = column.key;
                        return (
                          <SortableTableHeader
                            label={column.label}
                            active={productSortKey === sortKey}
                            direction={productSortDirection}
                            onClick={() => toggleProductSort(sortKey)}
                          />
                        );
                      })()}
                    </th>
                  ))}
                </tr>
              </thead>
              {showProductLoadingRows ? (
                <MasterTableLoadingRows
                  columns={visibleColumns}
                  rowLimit={productRowLimit}
                />
              ) : (
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product.id} className="ims-table-row">
                      {visibleColumns.map((column) => (
                        <td
                          key={`${product.id}-${column.key}`}
                          className={column.key === "action" ? "relative" : undefined}
                        >
                          {renderProductCell(product, column.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
            {!showProductLoadingRows && !error && products.length === 0 ? (
              <p className="ims-empty mt-3">No products found.</p>
            ) : null}
          </div>
          <MasterTablePagination
            totalItems={sortedProducts.length}
            currentPage={productPage}
            rowLimit={productRowLimit}
            onPageChange={setProductPage}
            loading={showProductLoadingRows}
          />
        </Card>
      </section>
    </div>
  );
}
