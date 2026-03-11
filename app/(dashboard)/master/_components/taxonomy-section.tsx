"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { MasterCsvSync } from "@/components/master/master-csv-sync";
import { MasterListSettingsMenu } from "@/components/master/master-list-settings-menu";
import { MasterPageHeader } from "@/components/master/master-page-header";
import { MasterPanelReveal } from "@/components/master/master-panel-reveal";
import { MasterTableLoadingRows } from "@/components/master/master-table-loading";
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
import { Input } from "@/components/ui/input";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { Select } from "@/components/ui/select";
import type { ExportColumn } from "@/lib/export/contracts";
import { hasAnyMasterPermission } from "@/lib/master-permissions";
import {
  buildFilterStorageKey,
  readLocalFilterState,
  removeLocalFilterState,
  writeLocalFilterState,
} from "@/lib/utils/local-filter-storage";
import { compareTextValues } from "@/lib/utils/sort-values";
import { fetchJson } from "@/lib/utils/fetch-json";
import {
  MasterRowLimitControl,
  MasterTablePagination,
  RowLimitOption,
  paginateRows,
  parseRowLimitOption,
} from "@/components/master/master-table-pagination";

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

type CategorySortKey = "code" | "name" | "active";
type SubcategorySortKey = "parent" | "code" | "name" | "active";

const CATEGORY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "code", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "is_active", label: "Active" },
];

const SUBCATEGORY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "category_code", label: "Category SKU" },
  { key: "code", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "is_active", label: "Active" },
];

const CATEGORY_COLUMN_DEFINITIONS = [
  { key: "code", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "active", label: "Active" },
  { key: "action", label: "Action" },
] as const;

const SUBCATEGORY_COLUMN_DEFINITIONS = [
  { key: "parent", label: "Parent Category" },
  { key: "code", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "active", label: "Active" },
  { key: "action", label: "Action" },
] as const;

type CategoryColumnKey = (typeof CATEGORY_COLUMN_DEFINITIONS)[number]["key"];
type SubcategoryColumnKey = (typeof SUBCATEGORY_COLUMN_DEFINITIONS)[number]["key"];

const CATEGORY_DEFAULT_COLUMN_ORDER: CategoryColumnKey[] = [
  "code",
  "name",
  "active",
  "action",
];

const SUBCATEGORY_DEFAULT_COLUMN_ORDER: SubcategoryColumnKey[] = [
  "parent",
  "code",
  "name",
  "active",
  "action",
];

const CATEGORY_DEFAULT_COLUMN_VISIBILITY = buildDefaultColumnVisibility(
  CATEGORY_DEFAULT_COLUMN_ORDER,
);

const SUBCATEGORY_DEFAULT_COLUMN_VISIBILITY = buildDefaultColumnVisibility(
  SUBCATEGORY_DEFAULT_COLUMN_ORDER,
);

function isCategorySortableColumn(key: CategoryColumnKey): key is CategorySortKey {
  return key !== "action";
}

function isSubcategorySortableColumn(
  key: SubcategoryColumnKey,
): key is SubcategorySortKey {
  return key !== "action";
}

export function TaxonomySection({ section }: { section: "categories" | "subcategories" }) {
  const { userId: authUserId, capabilities } = useDashboardSession();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [masterPanelOpen, setMasterPanelOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [archivedFilterHydrated, setArchivedFilterHydrated] = useState(false);
  const [categoryRowLimit, setCategoryRowLimit] = useState<RowLimitOption>(10);
  const [subcategoryRowLimit, setSubcategoryRowLimit] = useState<RowLimitOption>(10);
  const [categoryPage, setCategoryPage] = useState(1);
  const [subcategoryPage, setSubcategoryPage] = useState(1);
  const [categorySortKey, setCategorySortKey] = useState<CategorySortKey>("code");
  const [categorySortDirection, setCategorySortDirection] =
    useState<SortDirection>("asc");
  const [subcategorySortKey, setSubcategorySortKey] =
    useState<SubcategorySortKey>("parent");
  const [subcategorySortDirection, setSubcategorySortDirection] =
    useState<SortDirection>("asc");
  const [categoryLimitPrefsLoaded, setCategoryLimitPrefsLoaded] = useState(false);
  const [subcategoryLimitPrefsLoaded, setSubcategoryLimitPrefsLoaded] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: "",
    is_active: true,
  });
  const [newSubcategory, setNewSubcategory] = useState({
    category_id: "",
    name: "",
    is_active: true,
  });
  const archivedFilterStorageKey = buildFilterStorageKey(authUserId, "master", section);
  const categoryColumns = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:categories:columns:categories:${authUserId}`,
    columns: CATEGORY_COLUMN_DEFINITIONS,
    defaultOrder: CATEGORY_DEFAULT_COLUMN_ORDER,
    defaultVisibility: CATEGORY_DEFAULT_COLUMN_VISIBILITY,
  });
  const subcategoryColumns = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:categories:columns:subcategories:${authUserId}`,
    columns: SUBCATEGORY_COLUMN_DEFINITIONS,
    defaultOrder: SUBCATEGORY_DEFAULT_COLUMN_ORDER,
    defaultVisibility: SUBCATEGORY_DEFAULT_COLUMN_VISIBILITY,
  });

  const loadTaxonomy = useCallback(async (signal?: AbortSignal) => {
    setTaxonomyLoading(true);
    try {
      const [categoriesResult, subcategoriesResult] = await Promise.all([
        fetchJson<{ items?: ProductCategory[]; error?: string }>("/api/product-categories", {
          cache: "no-store",
          signal,
          fallbackError: "Failed to load categories.",
        }),
        fetchJson<{ items?: ProductSubcategory[]; error?: string }>(
          "/api/product-subcategories",
          {
            cache: "no-store",
            signal,
            fallbackError: "Failed to load subcategories.",
          },
        ),
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

      setError(null);
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
    loadTaxonomy(controller.signal).catch(() => setError("Failed to load taxonomy."));
    return () => controller.abort();
  }, [archivedFilterHydrated, loadTaxonomy]);

  useEffect(() => {
    if (!authUserId) {
      setCategoryLimitPrefsLoaded(false);
      return;
    }

    setCategoryLimitPrefsLoaded(false);
    const storageKey = `ims:categories:row-limit:categories:${authUserId}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setCategoryRowLimit(10);
        setCategoryLimitPrefsLoaded(true);
        return;
      }

      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Keep raw string for parser.
      }

      setCategoryRowLimit(parseRowLimitOption(parsed));
      setCategoryLimitPrefsLoaded(true);
    } catch {
      setCategoryRowLimit(10);
      setCategoryLimitPrefsLoaded(true);
    }
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) {
      setSubcategoryLimitPrefsLoaded(false);
      return;
    }

    setSubcategoryLimitPrefsLoaded(false);
    const storageKey = `ims:categories:row-limit:subcategories:${authUserId}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setSubcategoryRowLimit(10);
        setSubcategoryLimitPrefsLoaded(true);
        return;
      }

      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Keep raw string for parser.
      }

      setSubcategoryRowLimit(parseRowLimitOption(parsed));
      setSubcategoryLimitPrefsLoaded(true);
    } catch {
      setSubcategoryRowLimit(10);
      setSubcategoryLimitPrefsLoaded(true);
    }
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || !categoryLimitPrefsLoaded) {
      return;
    }

    const storageKey = `ims:categories:row-limit:categories:${authUserId}`;
    try {
      window.localStorage.setItem(storageKey, String(categoryRowLimit));
    } catch {
      // Ignore localStorage quota or privacy-mode write errors.
    }
  }, [authUserId, categoryLimitPrefsLoaded, categoryRowLimit]);

  useEffect(() => {
    if (!authUserId || !subcategoryLimitPrefsLoaded) {
      return;
    }

    const storageKey = `ims:categories:row-limit:subcategories:${authUserId}`;
    try {
      window.localStorage.setItem(storageKey, String(subcategoryRowLimit));
    } catch {
      // Ignore localStorage quota or privacy-mode write errors.
    }
  }, [authUserId, subcategoryLimitPrefsLoaded, subcategoryRowLimit]);

  const canCreateCategoryPermission = capabilities.master.categories.create;
  const canImportCategories = capabilities.master.categories.import;
  const canArchiveCategories = capabilities.master.categories.archive;
  const canDeleteCategories = capabilities.master.categories.delete;
  const canCreateSubcategoryPermission = capabilities.master.subcategories.create;
  const canImportSubcategories = capabilities.master.subcategories.import;
  const canArchiveSubcategories = capabilities.master.subcategories.archive;
  const canDeleteSubcategories = capabilities.master.subcategories.delete;
  const isCategoriesSection = section === "categories";
  const canShowTaxonomyPanel = isCategoriesSection
    ? hasAnyMasterPermission(capabilities.master, "categories", ["create", "import"])
    : hasAnyMasterPermission(capabilities.master, "subcategories", ["create", "import"]);
  const canImportTaxonomy = isCategoriesSection
    ? canImportCategories
    : canImportSubcategories;

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  );
  const categoriesById = useMemo(() => {
    const mapped = new Map<string, ProductCategory>();
    for (const category of categories) {
      mapped.set(category.id, category);
    }
    return mapped;
  }, [categories]);
  const filteredCategories = useMemo(
    () => (showInactive ? categories : categories.filter((category) => category.is_active)),
    [categories, showInactive],
  );
  const filteredSubcategories = useMemo(
    () =>
      showInactive
        ? subcategories
        : subcategories.filter((subcategory) => subcategory.is_active),
    [showInactive, subcategories],
  );
  const sortedCategories = useMemo(() => {
    const next = [...filteredCategories];
    next.sort((left, right) => {
      switch (categorySortKey) {
        case "code":
          return compareTextValues(left.code, right.code, categorySortDirection);
        case "name":
          return compareTextValues(left.name, right.name, categorySortDirection);
        case "active":
          return compareTextValues(left.is_active, right.is_active, categorySortDirection);
      }
    });
    return next;
  }, [categorySortDirection, categorySortKey, filteredCategories]);
  const sortedSubcategories = useMemo(() => {
    const next = [...filteredSubcategories];
    next.sort((left, right) => {
      switch (subcategorySortKey) {
        case "parent":
          return compareTextValues(
            categoriesById.get(left.category_id)?.name,
            categoriesById.get(right.category_id)?.name,
            subcategorySortDirection,
          );
        case "code":
          return compareTextValues(left.code, right.code, subcategorySortDirection);
        case "name":
          return compareTextValues(left.name, right.name, subcategorySortDirection);
        case "active":
          return compareTextValues(left.is_active, right.is_active, subcategorySortDirection);
      }
    });
    return next;
  }, [categoriesById, filteredSubcategories, subcategorySortDirection, subcategorySortKey]);
  const categoryPagination = useMemo(
    () => paginateRows(sortedCategories, categoryRowLimit, categoryPage),
    [categoryPage, categoryRowLimit, sortedCategories],
  );
  const subcategoryPagination = useMemo(
    () => paginateRows(sortedSubcategories, subcategoryRowLimit, subcategoryPage),
    [subcategoryPage, subcategoryRowLimit, sortedSubcategories],
  );
  const visibleCategories = categoryPagination.items;
  const visibleSubcategories = subcategoryPagination.items;
  const categoryExportRows = filteredCategories.map((category) => ({
    code: category.code,
    name: category.name,
    is_active: category.is_active,
  }));
  const subcategoryExportRows = filteredSubcategories.map((subcategory) => ({
    category_code: categoriesById.get(subcategory.category_id)?.code ?? "",
    code: subcategory.code,
    name: subcategory.name,
    is_active: subcategory.is_active,
  }));
  const taxonomyFilterSummary = [`Disabled included: ${showInactive ? "Yes" : "No"}`];

  useEffect(() => {
    setCategoryPage(1);
  }, [categoryRowLimit, categorySortDirection, categorySortKey, showInactive]);

  useEffect(() => {
    setSubcategoryPage(1);
  }, [showInactive, subcategoryRowLimit, subcategorySortDirection, subcategorySortKey]);

  useEffect(() => {
    setCategoryPage((current) => Math.min(current, categoryPagination.totalPages));
  }, [categoryPagination.totalPages]);

  useEffect(() => {
    setSubcategoryPage((current) =>
      Math.min(current, subcategoryPagination.totalPages),
    );
  }, [subcategoryPagination.totalPages]);

  useEffect(() => {
    if (!newSubcategory.category_id) {
      return;
    }
    if (activeCategories.some((category) => category.id === newSubcategory.category_id)) {
      return;
    }
    setNewSubcategory((current) => ({
      ...current,
      category_id: "",
    }));
  }, [activeCategories, newSubcategory.category_id]);

  const canCreateCategory = newCategory.name.trim().length >= 2;
  const canCreateSubcategory =
    newSubcategory.name.trim().length >= 2 &&
    newSubcategory.category_id.length > 0;

  async function createCategory() {
    if (!canCreateCategoryPermission || !canCreateCategory) {
      return;
    }

    setTaxonomySaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>("/api/product-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCategory.name.trim(),
          is_active: newCategory.is_active,
        }),
        fallbackError: "Failed to create category.",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNewCategory({
        name: "",
        is_active: true,
      });
      setMessage("Category created.");
      await loadTaxonomy();
    } finally {
      setTaxonomySaving(false);
    }
  }

  async function createSubcategory() {
    if (!canCreateSubcategoryPermission || !canCreateSubcategory) {
      return;
    }

    setTaxonomySaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>("/api/product-subcategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: newSubcategory.category_id,
          name: newSubcategory.name.trim(),
          is_active: newSubcategory.is_active,
        }),
        fallbackError: "Failed to create subcategory.",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNewSubcategory((current) => ({
        ...current,
        name: "",
        is_active: true,
      }));
      setMessage("Subcategory created.");
      await loadTaxonomy();
    } finally {
      setTaxonomySaving(false);
    }
  }

  async function setCategoryActive(categoryId: string, active: boolean) {
    if (!canArchiveCategories) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const endpoint = active ? "activate" : "archive";
      const result = await fetchJson<{ error?: string }>(
        `/api/product-categories/${categoryId}/${endpoint}`,
        {
          method: "POST",
          fallbackError: `Failed to ${endpoint} category.`,
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(active ? "Category activated." : "Category archived.");
      await loadTaxonomy();
    } finally {
      setActionLoading(false);
    }
  }

  async function hardDeleteCategory(category: ProductCategory) {
    if (!canDeleteCategories) {
      return;
    }

    const confirmed = confirm(
      `Hard delete category "${category.name}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/product-categories/${category.id}/hard-delete`,
        {
          method: "POST",
          fallbackError: "Failed to hard delete category.",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Category hard deleted.");
      await loadTaxonomy();
    } finally {
      setActionLoading(false);
    }
  }

  async function setSubcategoryActive(subcategoryId: string, active: boolean) {
    if (!canArchiveSubcategories) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const endpoint = active ? "activate" : "archive";
      const result = await fetchJson<{ error?: string }>(
        `/api/product-subcategories/${subcategoryId}/${endpoint}`,
        {
          method: "POST",
          fallbackError: `Failed to ${endpoint} subcategory.`,
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(active ? "Subcategory activated." : "Subcategory archived.");
      await loadTaxonomy();
    } finally {
      setActionLoading(false);
    }
  }

  async function hardDeleteSubcategory(subcategory: ProductSubcategory) {
    if (!canDeleteSubcategories) {
      return;
    }

    const confirmed = confirm(
      `Hard delete subcategory "${subcategory.name}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/product-subcategories/${subcategory.id}/hard-delete`,
        {
          method: "POST",
          fallbackError: "Failed to hard delete subcategory.",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Subcategory hard deleted.");
      await loadTaxonomy();
    } finally {
      setActionLoading(false);
    }
  }

  function toggleCategorySort(nextKey: CategorySortKey) {
    setCategorySortDirection((current) =>
      categorySortKey === nextKey ? (current === "asc" ? "desc" : "asc") : "asc",
    );
    setCategorySortKey(nextKey);
  }

  function toggleSubcategorySort(nextKey: SubcategorySortKey) {
    setSubcategorySortDirection((current) =>
      subcategorySortKey === nextKey ? (current === "asc" ? "desc" : "asc") : "asc",
    );
    setSubcategorySortKey(nextKey);
  }

  function renderCategoryCell(category: ProductCategory, columnKey: CategoryColumnKey) {
    if (columnKey === "code") {
      return <span className="font-medium">{category.code}</span>;
    }

    if (columnKey === "name") {
      return category.name;
    }

    if (columnKey === "active") {
      return category.is_active ? "Yes" : "No";
    }

    const actionItems = [];

    if (canArchiveCategories) {
      actionItems.push({
        label: category.is_active ? "Archive" : "Activate",
        onSelect: () => setCategoryActive(category.id, !category.is_active),
      });
    }

    if (canDeleteCategories) {
      actionItems.push({
        label: "Delete",
        destructive: true,
        onSelect: () => hardDeleteCategory(category),
      });
    }

    if (actionItems.length === 0) {
      return <span className="text-xs text-[var(--text-muted)]">--</span>;
    }

    return (
      <RowActionsMenu
        label={`Open actions for ${category.name}`}
        disabled={actionLoading}
        items={actionItems}
      />
    );
  }

  function renderSubcategoryCell(
    subcategory: ProductSubcategory,
    columnKey: SubcategoryColumnKey,
  ) {
    const parent = categoriesById.get(subcategory.category_id);

    if (columnKey === "parent") {
      return parent ? `${parent.code} - ${parent.name}` : "--";
    }

    if (columnKey === "code") {
      return <span className="font-medium">{subcategory.code}</span>;
    }

    if (columnKey === "name") {
      return subcategory.name;
    }

    if (columnKey === "active") {
      return subcategory.is_active ? "Yes" : "No";
    }

    const actionItems = [];

    if (canArchiveSubcategories) {
      actionItems.push({
        label: subcategory.is_active ? "Archive" : "Activate",
        onSelect: () => setSubcategoryActive(subcategory.id, !subcategory.is_active),
      });
    }

    if (canDeleteSubcategories) {
      actionItems.push({
        label: "Delete",
        destructive: true,
        onSelect: () => hardDeleteSubcategory(subcategory),
      });
    }

    if (actionItems.length === 0) {
      return <span className="text-xs text-[var(--text-muted)]">--</span>;
    }

    return (
      <RowActionsMenu
        label={`Open actions for ${subcategory.name}`}
        disabled={actionLoading}
        items={actionItems}
      />
    );
  }

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

  const showTaxonomyLoadingRows = !archivedFilterHydrated || taxonomyLoading;

  return (
    <div className="space-y-6">
      <MasterPageHeader
        title={isCategoriesSection ? "Categories" : "Subcategories"}
        subtitle={
          isCategoriesSection
            ? "Manage product categories."
            : "Manage product subcategories."
        }
        showAction={canShowTaxonomyPanel}
        panelOpen={masterPanelOpen}
        onTogglePanel={() => setMasterPanelOpen((current) => !current)}
        openLabel={
          isCategoriesSection
            ? "Open category actions"
            : "Open subcategory actions"
        }
        closeLabel={
          isCategoriesSection
            ? "Close category actions"
            : "Close subcategory actions"
        }
      />

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {canShowTaxonomyPanel ? (
          <MasterPanelReveal open={masterPanelOpen} className="space-y-4">
            <MasterCsvSync
              entity={isCategoriesSection ? "categories" : "subcategories"}
              canManage={canImportTaxonomy}
              onImported={async () => {
                await loadTaxonomy();
              }}
            >
              {isCategoriesSection && canCreateCategoryPermission ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={newCategory.name}
                    placeholder="Category name"
                    className="ims-control-md flex-1"
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
                    className="ims-control-md"
                    disabled={!canCreateCategory || taxonomySaving}
                    onClick={() => createCategory()}
                  >
                    Add
                  </Button>
                </div>
              ) : !isCategoriesSection && canCreateSubcategoryPermission ? (
                <div className="space-y-2">
                  <Select
                    className="ims-control-md"
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
                      className="ims-control-md flex-1"
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
                      className="ims-control-md"
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
              ) : null}
            </MasterCsvSync>
          </MasterPanelReveal>
      ) : (
        <MasterCsvSync
          entity={isCategoriesSection ? "categories" : "subcategories"}
          canManage={canImportTaxonomy}
          onImported={async () => {
            await loadTaxonomy();
          }}
        />
      )}

      {isCategoriesSection ? (
        <section>
          <Card className="min-h-[28rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
                <MasterRowLimitControl
                  value={categoryRowLimit}
                  onChange={(limit) => {
                    setCategoryRowLimit(limit);
                    setCategoryPage(1);
                  }}
                />
                <h2 className="min-w-0 text-lg font-semibold">Categories</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {taxonomyLoading ? (
                  <span className="text-xs text-[var(--text-muted)]">Refreshing...</span>
                ) : null}
                <MasterListSettingsMenu
                  orderedColumns={categoryColumns.orderedColumns}
                  columnVisibility={categoryColumns.columnVisibility}
                  onToggleColumn={categoryColumns.toggleColumnVisibility}
                  onMoveColumn={categoryColumns.moveColumn}
                  onResetColumns={categoryColumns.resetColumnPreferences}
                  columnsHelperText="Toggle and reorder category columns."
                  showInactive={showInactive}
                  onShowInactiveChange={(pressed) => setShowInactive(pressed)}
                  exportTitle="Categories"
                  exportFilenameBase="categories"
                  exportColumns={CATEGORY_EXPORT_COLUMNS}
                  exportRows={categoryExportRows}
                  exportFilterSummary={taxonomyFilterSummary}
                  exportEmptyMessage="No categories available."
                />
              </div>
            </div>

          <div className="mt-4 overflow-visible">
              <table className="ims-table" aria-busy={showTaxonomyLoadingRows}>
                <thead className="ims-table-head">
                  <tr>
                    {categoryColumns.visibleColumns.map((column) => (
                      <th key={column.key}>
                        {!isCategorySortableColumn(column.key) ? column.label : (() => {
                          const sortKey = column.key;
                          return (
                            <SortableTableHeader
                              label={column.label}
                              active={categorySortKey === sortKey}
                              direction={categorySortDirection}
                              onClick={() => toggleCategorySort(sortKey)}
                            />
                          );
                        })()}
                      </th>
                    ))}
                  </tr>
                </thead>
                {showTaxonomyLoadingRows ? (
                  <MasterTableLoadingRows
                    columns={categoryColumns.visibleColumns}
                    rowLimit={categoryRowLimit}
                  />
                ) : (
                  <tbody>
                    {visibleCategories.map((category) => (
                      <tr key={category.id} className="ims-table-row">
                        {categoryColumns.visibleColumns.map((column) => (
                          <td key={`${category.id}-${column.key}`}>
                            {renderCategoryCell(category, column.key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
              {!showTaxonomyLoadingRows && !error && categories.length === 0 ? (
                <p className="ims-empty mt-3">No categories yet.</p>
              ) : null}
            </div>

            <MasterTablePagination
              totalItems={filteredCategories.length}
              currentPage={categoryPage}
              rowLimit={categoryRowLimit}
              onPageChange={setCategoryPage}
              loading={showTaxonomyLoadingRows}
            />
          </Card>
        </section>
      ) : (
        <section>
          <Card className="min-h-[28rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
                <MasterRowLimitControl
                  value={subcategoryRowLimit}
                  onChange={(limit) => {
                    setSubcategoryRowLimit(limit);
                    setSubcategoryPage(1);
                  }}
                />
                <h2 className="min-w-0 text-lg font-semibold">Subcategories</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {taxonomyLoading ? (
                  <span className="text-xs text-[var(--text-muted)]">Refreshing...</span>
                ) : null}
                <MasterListSettingsMenu
                  orderedColumns={subcategoryColumns.orderedColumns}
                  columnVisibility={subcategoryColumns.columnVisibility}
                  onToggleColumn={subcategoryColumns.toggleColumnVisibility}
                  onMoveColumn={subcategoryColumns.moveColumn}
                  onResetColumns={subcategoryColumns.resetColumnPreferences}
                  columnsHelperText="Toggle and reorder subcategory columns."
                  showInactive={showInactive}
                  onShowInactiveChange={(pressed) => setShowInactive(pressed)}
                  exportTitle="Subcategories"
                  exportFilenameBase="subcategories"
                  exportColumns={SUBCATEGORY_EXPORT_COLUMNS}
                  exportRows={subcategoryExportRows}
                  exportFilterSummary={taxonomyFilterSummary}
                  exportEmptyMessage="No subcategories available."
                />
              </div>
            </div>

          <div className="mt-4 overflow-visible">
              <table className="ims-table" aria-busy={showTaxonomyLoadingRows}>
                <thead className="ims-table-head">
                  <tr>
                    {subcategoryColumns.visibleColumns.map((column) => (
                      <th key={column.key}>
                        {!isSubcategorySortableColumn(column.key) ? column.label : (() => {
                          const sortKey = column.key;
                          return (
                            <SortableTableHeader
                              label={column.label}
                              active={subcategorySortKey === sortKey}
                              direction={subcategorySortDirection}
                              onClick={() => toggleSubcategorySort(sortKey)}
                            />
                          );
                        })()}
                      </th>
                    ))}
                  </tr>
                </thead>
                {showTaxonomyLoadingRows ? (
                  <MasterTableLoadingRows
                    columns={subcategoryColumns.visibleColumns}
                    rowLimit={subcategoryRowLimit}
                  />
                ) : (
                  <tbody>
                    {visibleSubcategories.map((subcategory) => (
                      <tr key={subcategory.id} className="ims-table-row">
                        {subcategoryColumns.visibleColumns.map((column) => (
                          <td key={`${subcategory.id}-${column.key}`}>
                            {renderSubcategoryCell(subcategory, column.key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
              {!showTaxonomyLoadingRows && !error && subcategories.length === 0 ? (
                <p className="ims-empty mt-3">No subcategories yet.</p>
              ) : null}
            </div>

            <MasterTablePagination
              totalItems={filteredSubcategories.length}
              currentPage={subcategoryPage}
              rowLimit={subcategoryRowLimit}
              onPageChange={setSubcategoryPage}
              loading={showTaxonomyLoadingRows}
            />
          </Card>
        </section>
      )}
    </div>
  );
}
