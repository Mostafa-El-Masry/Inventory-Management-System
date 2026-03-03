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
type ProductColumnDefinition = (typeof PRODUCT_COLUMN_DEFINITIONS)[number];

const PRODUCT_COLUMN_KEY_SET = new Set<ProductColumnKey>(
  PRODUCT_COLUMN_DEFINITIONS.map((column) => column.key),
);

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

const DEFAULT_PRODUCT_COLUMN_VISIBILITY: Record<ProductColumnKey, boolean> = {
  name: true,
  barcode: true,
  sku: false,
  category: false,
  subcategory: false,
  unit: false,
  active: false,
  action: false,
};

function getDefaultProductColumnOrder() {
  return [...DEFAULT_PRODUCT_COLUMN_ORDER];
}

function getDefaultProductColumnVisibility(): Record<ProductColumnKey, boolean> {
  return { ...DEFAULT_PRODUCT_COLUMN_VISIBILITY };
}

function isProductColumnKey(value: unknown): value is ProductColumnKey {
  return typeof value === "string" && PRODUCT_COLUMN_KEY_SET.has(value as ProductColumnKey);
}

function normalizeProductColumnOrder(raw: unknown): ProductColumnKey[] {
  if (!Array.isArray(raw)) {
    return getDefaultProductColumnOrder();
  }

  const ordered: ProductColumnKey[] = [];
  for (const value of raw) {
    if (!isProductColumnKey(value)) {
      continue;
    }
    if (ordered.includes(value)) {
      continue;
    }
    ordered.push(value);
  }

  for (const value of DEFAULT_PRODUCT_COLUMN_ORDER) {
    if (!ordered.includes(value)) {
      ordered.push(value);
    }
  }

  return ordered;
}

function normalizeProductColumnVisibility(raw: unknown): Record<ProductColumnKey, boolean> {
  const next = getDefaultProductColumnVisibility();
  if (!raw || typeof raw !== "object") {
    return next;
  }

  for (const key of DEFAULT_PRODUCT_COLUMN_ORDER) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "boolean") {
      next[key] = value;
    }
  }

  const visibleCount = DEFAULT_PRODUCT_COLUMN_ORDER.reduce(
    (count, key) => count + (next[key] ? 1 : 0),
    0,
  );
  if (visibleCount === 0) {
    return getDefaultProductColumnVisibility();
  }

  return next;
}

type RowLimitOption = 10 | 50 | 100 | "all";

function parseRowLimitOption(raw: unknown): RowLimitOption {
  if (raw === 10 || raw === "10") {
    return 10;
  }
  if (raw === 50 || raw === "50") {
    return 50;
  }
  if (raw === 100 || raw === "100") {
    return 100;
  }
  if (raw === "all") {
    return "all";
  }
  return 10;
}

function sliceRowsByLimit<T>(rows: T[], limit: RowLimitOption) {
  if (limit === "all") {
    return rows;
  }
  return rows.slice(0, limit);
}

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
  user_id: string;
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
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [taxonomyMessage, setTaxonomyMessage] = useState<string | null>(null);
  const [showCreateRow, setShowCreateRow] = useState(false);
  const [quickTaxonomyOpen, setQuickTaxonomyOpen] = useState(false);
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const [columnPrefsLoaded, setColumnPrefsLoaded] = useState(false);
  const [productRowLimit, setProductRowLimit] = useState<RowLimitOption>(10);
  const [productRowLimitPrefsLoaded, setProductRowLimitPrefsLoaded] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ProductColumnKey[]>(() =>
    getDefaultProductColumnOrder(),
  );
  const [columnVisibility, setColumnVisibility] = useState<
    Record<ProductColumnKey, boolean>
  >(() => getDefaultProductColumnVisibility());
  const [openActionMenuProductId, setOpenActionMenuProductId] = useState<string | null>(
    null,
  );
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
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const columnsPanelRef = useRef<HTMLDivElement | null>(null);

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
    setError(null);
    setOpenActionMenuProductId(null);
    setProducts(json.items ?? []);
  }, [showInactive]);

  const loadAuth = useCallback(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const json = (await response.json()) as AuthMe & { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load permissions.");
      return;
    }
    setAuthUserId(json.user_id ?? null);
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

    setCategories(categoriesJson.items ?? []);
    setSubcategories(subcategoriesJson.items ?? []);
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

  useEffect(() => {
    if (!authUserId) {
      setColumnPrefsLoaded(false);
      return;
    }

    setColumnPrefsLoaded(false);
    const storageKey = `ims:products:columns:${authUserId}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setColumnOrder(getDefaultProductColumnOrder());
        setColumnVisibility(getDefaultProductColumnVisibility());
        setColumnPrefsLoaded(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        order?: unknown;
        visibility?: unknown;
      };
      setColumnOrder(normalizeProductColumnOrder(parsed.order));
      setColumnVisibility(normalizeProductColumnVisibility(parsed.visibility));
      setColumnPrefsLoaded(true);
    } catch {
      setColumnOrder(getDefaultProductColumnOrder());
      setColumnVisibility(getDefaultProductColumnVisibility());
      setColumnPrefsLoaded(true);
    }
  }, [authUserId]);

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
    if (!authUserId || !columnPrefsLoaded) {
      return;
    }

    const storageKey = `ims:products:columns:${authUserId}`;
    const payload = {
      version: 1,
      order: columnOrder,
      visibility: columnVisibility,
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore localStorage quota or privacy-mode write errors.
    }
  }, [authUserId, columnPrefsLoaded, columnOrder, columnVisibility]);

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
    if (!columnsPanelOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!columnsPanelRef.current) {
        return;
      }
      if (!columnsPanelRef.current.contains(event.target as Node)) {
        setColumnsPanelOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setColumnsPanelOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [columnsPanelOpen]);

  useEffect(() => {
    if (!openActionMenuProductId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!actionMenuRef.current) {
        return;
      }
      if (!actionMenuRef.current.contains(event.target as Node)) {
        setOpenActionMenuProductId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenActionMenuProductId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionMenuProductId]);

  useEffect(() => {
    if (!columnVisibility.action && openActionMenuProductId) {
      setOpenActionMenuProductId(null);
    }
  }, [columnVisibility.action, openActionMenuProductId]);

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

  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((key) => PRODUCT_COLUMN_DEFINITIONS.find((column) => column.key === key))
        .filter((column): column is ProductColumnDefinition => column !== undefined),
    [columnOrder],
  );

  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => columnVisibility[column.key]),
    [orderedColumns, columnVisibility],
  );
  const visibleProducts = useMemo(
    () => sliceRowsByLimit(products, productRowLimit),
    [products, productRowLimit],
  );

  function toggleColumnVisibility(columnKey: ProductColumnKey) {
    setColumnVisibility((current) => {
      if (current[columnKey]) {
        const visibleCount = DEFAULT_PRODUCT_COLUMN_ORDER.reduce(
          (count, key) => count + (current[key] ? 1 : 0),
          0,
        );
        if (visibleCount <= 1) {
          return current;
        }
      }

      return {
        ...current,
        [columnKey]: !current[columnKey],
      };
    });
  }

  function moveColumn(columnKey: ProductColumnKey, direction: -1 | 1) {
    setColumnOrder((current) => {
      const index = current.indexOf(columnKey);
      if (index < 0) {
        return current;
      }

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  }

  function resetColumnPreferences() {
    setColumnOrder(getDefaultProductColumnOrder());
    setColumnVisibility(getDefaultProductColumnVisibility());
  }

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
    setTaxonomyMessage(null);
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
    setTaxonomyMessage("Category created. Product dropdowns refreshed.");
    await loadTaxonomy();
    setTaxonomySaving(false);
  }

  async function createSubcategory() {
    if (!canCreateProductMaster || !canCreateSubcategory) {
      return;
    }

    setTaxonomySaving(true);
    setError(null);
    setTaxonomyMessage(null);
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
    setTaxonomyMessage("Subcategory created. Product dropdowns refreshed.");
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
      if (!capabilities?.canArchiveProducts) {
        return <span className="text-xs text-[var(--text-muted)]">restricted</span>;
      }

      return (
        <>
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
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
          <div
            ref={openActionMenuProductId === product.id ? actionMenuRef : null}
            className="inline-flex items-center lg:hidden"
          >
            <Button
              variant="secondary"
              className="h-8 w-8 rounded-full p-0 text-sm leading-none"
              disabled={stateLoading}
              aria-label={`Open actions for ${product.name}`}
              aria-expanded={openActionMenuProductId === product.id}
              onClick={() =>
                setOpenActionMenuProductId((current) =>
                  current === product.id ? null : product.id,
                )
              }
            >
              ...
            </Button>
            {openActionMenuProductId === product.id ? (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+0.35rem)] z-20 min-w-[8.75rem] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-md)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
                  onClick={() => {
                    setOpenActionMenuProductId(null);
                    setProductActive(product.id, !product.is_active);
                  }}
                >
                  {product.is_active ? "Archive" : "Activate"}
                </button>
                {product.can_hard_delete ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                    onClick={() => {
                      setOpenActionMenuProductId(null);
                      hardDeleteProduct(product);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      );
    }

    return null;
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
      {taxonomyMessage ? <p className="ims-alert-success">{taxonomyMessage}</p> : null}

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

      <section>
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Product List</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Button
                  variant="secondary"
                  className="h-9 rounded-xl"
                  onClick={() => setColumnsPanelOpen((current) => !current)}
                  aria-expanded={columnsPanelOpen}
                >
                  Columns
                </Button>
                {columnsPanelOpen ? (
                  <div
                    ref={columnsPanelRef}
                    className="absolute right-0 top-[calc(100%+0.35rem)] z-20 w-[17.5rem] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-md)]"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Visible Columns</p>
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => resetColumnPreferences()}
                      >
                        Reset
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {orderedColumns.map((column, index) => (
                        <div
                          key={column.key}
                          className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1.5"
                        >
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={columnVisibility[column.key]}
                              onChange={() => toggleColumnVisibility(column.key)}
                            />
                            {column.label}
                          </label>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="secondary"
                              className="h-7 w-7 rounded-md p-0 text-xs"
                              disabled={index === 0}
                              aria-label={`Move ${column.label} up`}
                              onClick={() => moveColumn(column.key, -1)}
                            >
                              ^
                            </Button>
                            <Button
                              variant="secondary"
                              className="h-7 w-7 rounded-md p-0 text-xs"
                              disabled={index === orderedColumns.length - 1}
                              aria-label={`Move ${column.label} down`}
                              onClick={() => moveColumn(column.key, 1)}
                            >
                              v
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Default view shows Name and Barcode only.
                    </p>
                  </div>
                ) : null}
              </div>
              {canCreateProductMaster ? (
                <Button
                  variant="secondary"
                  className="h-9 rounded-xl"
                  onClick={() => setQuickTaxonomyOpen((current) => !current)}
                >
                  {quickTaxonomyOpen ? "Hide Taxonomy" : "Quick Taxonomy"}
                </Button>
              ) : null}
              {canCreateProductMaster ? (
                <Button
                  variant="secondary"
                  className="h-9 w-9 rounded-full p-0 text-lg leading-none"
                  aria-label={
                    showCreateRow ? "Hide product create form" : "Show product create form"
                  }
                  onClick={() => setShowCreateRow((current) => !current)}
                >
                  {showCreateRow ? "X" : "+"}
                </Button>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                Rows
                <Select
                  className="h-9 w-[5.5rem]"
                  value={String(productRowLimit)}
                  onChange={(event) =>
                    setProductRowLimit(parseRowLimitOption(event.target.value))
                  }
                >
                  <option value="10">10</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="all">All</option>
                </Select>
              </label>
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

          {canCreateProductMaster && quickTaxonomyOpen ? (
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Quick Create Taxonomy</h3>
                <span className="text-xs text-[var(--text-muted)]">
                  {taxonomyLoading ? "Refreshing masters..." : `${categories.length} categories`}
                </span>
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="text-sm font-medium">Category</p>
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
                </div>

                <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="text-sm font-medium">Subcategory</p>
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
                    {activeCategories.map((category) => (
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
                  {activeCategories.length === 0 ? (
                    <p className="ims-alert-warn text-xs">
                      Create an active category first to add subcategories.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {canCreateProductMaster && showCreateRow ? (
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <h3 className="text-sm font-semibold">Create Product</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
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
                    className="h-10"
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
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="ims-field-label mb-0">Category</label>
                  <Select
                    className="h-10"
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
                      Create an active category first in Quick Taxonomy or Categories.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <label className="ims-field-label mb-0">Subcategory</label>
                  <Select
                    className="h-10"
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
                      This category has no active subcategories. Create one first.
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
                    className="h-10"
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
                    className="h-10"
                    disabled={!canCreateProduct || createLoading || taxonomyLoading}
                    onClick={() => createProduct()}
                  >
                    {createLoading ? "Saving..." : "Create"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 max-h-[36rem] overflow-auto">
            <table className="ims-table ims-table-products">
              <thead className="ims-table-head">
                <tr>
                  {visibleColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
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
