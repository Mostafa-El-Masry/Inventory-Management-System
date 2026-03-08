"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { MasterCsvSync } from "@/components/master/master-csv-sync";
import { MasterPageHeader } from "@/components/master/master-page-header";
import {
  SortDirection,
  SortableTableHeader,
} from "@/components/master/sortable-table-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
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
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "is_active", label: "Active" },
];

const SUBCATEGORY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "category_code", label: "Category Code" },
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "is_active", label: "Active" },
];

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

  const canManageTaxonomy = capabilities.canCreateProductMaster;

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
    if (!canManageTaxonomy || !canCreateCategory) {
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
    if (!canManageTaxonomy || !canCreateSubcategory) {
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
    if (!canManageTaxonomy) {
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
    if (!canManageTaxonomy) {
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
    if (!canManageTaxonomy) {
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
    if (!canManageTaxonomy) {
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

  const isCategoriesSection = section === "categories";

  return (
    <div className="space-y-6">
      <MasterPageHeader
        kicker="Master Data"
        title={isCategoriesSection ? "Categories" : "Subcategories"}
        subtitle={
          isCategoriesSection
            ? "Manage product categories."
            : "Manage product subcategories."
        }
        showAction={canManageTaxonomy}
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

      {canManageTaxonomy ? (
        masterPanelOpen ? (
          <div className="space-y-4">
            <MasterCsvSync
              entity={isCategoriesSection ? "categories" : "subcategories"}
              canManage={canManageTaxonomy}
              title={isCategoriesSection ? "Categories" : "Subcategories"}
              filenameBase={isCategoriesSection ? "categories" : "subcategories"}
              columns={isCategoriesSection ? CATEGORY_EXPORT_COLUMNS : SUBCATEGORY_EXPORT_COLUMNS}
              rows={
                isCategoriesSection
                  ? filteredCategories.map((category) => ({
                      code: category.code,
                      name: category.name,
                      is_active: category.is_active,
                    }))
                  : filteredSubcategories.map((subcategory) => ({
                      category_code: categoriesById.get(subcategory.category_id)?.code ?? "",
                      code: subcategory.code,
                      name: subcategory.name,
                      is_active: subcategory.is_active,
                    }))
              }
              helperText={
                isCategoriesSection
                  ? "Keys by category code (2 digits)."
                  : "Keys by category_code + subcategory code (2 + 3 digits)."
              }
              filterSummary={[`Archived included: ${showInactive ? "Yes" : "No"}`]}
              onImported={async () => {
                await loadTaxonomy();
              }}
            />

            {isCategoriesSection ? (
              <Card className="min-h-[12rem]">
                <h2 className="text-lg font-semibold">Create Category</h2>
                <div className="mt-4 flex flex-wrap items-center gap-2">
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
              </Card>
            ) : (
              <Card className="min-h-[12rem]">
                <h2 className="text-lg font-semibold">Create Subcategory</h2>
                <div className="mt-4 space-y-2">
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
              </Card>
            )}
          </div>
        ) : null
      ) : (
        <MasterCsvSync
          entity={isCategoriesSection ? "categories" : "subcategories"}
          canManage={canManageTaxonomy}
          title={isCategoriesSection ? "Categories" : "Subcategories"}
          filenameBase={isCategoriesSection ? "categories" : "subcategories"}
          columns={isCategoriesSection ? CATEGORY_EXPORT_COLUMNS : SUBCATEGORY_EXPORT_COLUMNS}
          rows={
            isCategoriesSection
              ? filteredCategories.map((category) => ({
                  code: category.code,
                  name: category.name,
                  is_active: category.is_active,
                }))
              : filteredSubcategories.map((subcategory) => ({
                  category_code: categoriesById.get(subcategory.category_id)?.code ?? "",
                  code: subcategory.code,
                  name: subcategory.name,
                  is_active: subcategory.is_active,
                }))
          }
          helperText={
            isCategoriesSection
              ? "Keys by category code (2 digits)."
              : "Keys by category_code + subcategory code (2 + 3 digits)."
          }
          filterSummary={[`Archived included: ${showInactive ? "Yes" : "No"}`]}
          onImported={async () => {
            await loadTaxonomy();
          }}
        />
      )}

      {isCategoriesSection ? (
        <section>
          <Card className="min-h-[28rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Categories</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-muted)]">
                  {taxonomyLoading ? "Refreshing..." : `${filteredCategories.length} total`}
                </span>
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

            <div className="mt-4 max-h-[23rem] overflow-auto">
              <table className="ims-table">
                <thead className="ims-table-head">
                  <tr>
                    <th>
                      <SortableTableHeader
                        label="Code"
                        active={categorySortKey === "code"}
                        direction={categorySortDirection}
                        onClick={() => toggleCategorySort("code")}
                      />
                    </th>
                    <th>
                      <SortableTableHeader
                        label="Name"
                        active={categorySortKey === "name"}
                        direction={categorySortDirection}
                        onClick={() => toggleCategorySort("name")}
                      />
                    </th>
                    <th>
                      <SortableTableHeader
                        label="Active"
                        active={categorySortKey === "active"}
                        direction={categorySortDirection}
                        onClick={() => toggleCategorySort("active")}
                      />
                    </th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCategories.map((category) => (
                    <tr key={category.id} className="ims-table-row">
                      <td className="font-medium">{category.code}</td>
                      <td>{category.name}</td>
                      <td>{category.is_active ? "Yes" : "No"}</td>
                      <td>
                        {canManageTaxonomy ? (
                          <RowActionsMenu
                            label={`Open actions for ${category.name}`}
                            disabled={actionLoading}
                            items={[
                              {
                                label: category.is_active ? "Archive" : "Activate",
                                onSelect: () =>
                                  setCategoryActive(category.id, !category.is_active),
                              },
                              {
                                label: "Delete",
                                destructive: true,
                                onSelect: () => hardDeleteCategory(category),
                              },
                            ]}
                          />
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">restricted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {categories.length === 0 ? (
                <p className="ims-empty mt-3">No categories yet.</p>
              ) : null}
            </div>

            <MasterTablePagination
              totalItems={filteredCategories.length}
              currentPage={categoryPage}
              rowLimit={categoryRowLimit}
              onPageChange={setCategoryPage}
              onRowLimitChange={(limit) => {
                setCategoryRowLimit(limit);
                setCategoryPage(1);
              }}
            />
          </Card>
        </section>
      ) : (
        <section>
          <Card className="min-h-[28rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Subcategories</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-muted)]">
                  {taxonomyLoading ? "Refreshing..." : `${filteredSubcategories.length} total`}
                </span>
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

            <div className="mt-4 max-h-[23rem] overflow-auto">
              <table className="ims-table">
                <thead className="ims-table-head">
                  <tr>
                    <th>
                      <SortableTableHeader
                        label="Parent Category"
                        active={subcategorySortKey === "parent"}
                        direction={subcategorySortDirection}
                        onClick={() => toggleSubcategorySort("parent")}
                      />
                    </th>
                    <th>
                      <SortableTableHeader
                        label="Code"
                        active={subcategorySortKey === "code"}
                        direction={subcategorySortDirection}
                        onClick={() => toggleSubcategorySort("code")}
                      />
                    </th>
                    <th>
                      <SortableTableHeader
                        label="Name"
                        active={subcategorySortKey === "name"}
                        direction={subcategorySortDirection}
                        onClick={() => toggleSubcategorySort("name")}
                      />
                    </th>
                    <th>
                      <SortableTableHeader
                        label="Active"
                        active={subcategorySortKey === "active"}
                        direction={subcategorySortDirection}
                        onClick={() => toggleSubcategorySort("active")}
                      />
                    </th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSubcategories.map((subcategory) => {
                    const parent = categoriesById.get(subcategory.category_id);
                    return (
                      <tr key={subcategory.id} className="ims-table-row">
                        <td>{parent ? `${parent.code} - ${parent.name}` : "--"}</td>
                        <td className="font-medium">{subcategory.code}</td>
                        <td>{subcategory.name}</td>
                        <td>{subcategory.is_active ? "Yes" : "No"}</td>
                        <td>
                          {canManageTaxonomy ? (
                            <RowActionsMenu
                              label={`Open actions for ${subcategory.name}`}
                              disabled={actionLoading}
                              items={[
                                {
                                  label: subcategory.is_active ? "Archive" : "Activate",
                                  onSelect: () =>
                                    setSubcategoryActive(
                                      subcategory.id,
                                      !subcategory.is_active,
                                    ),
                                },
                                {
                                  label: "Delete",
                                  destructive: true,
                                  onSelect: () => hardDeleteSubcategory(subcategory),
                                },
                              ]}
                            />
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">restricted</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {subcategories.length === 0 ? (
                <p className="ims-empty mt-3">No subcategories yet.</p>
              ) : null}
            </div>

            <MasterTablePagination
              totalItems={filteredSubcategories.length}
              currentPage={subcategoryPage}
              rowLimit={subcategoryRowLimit}
              onPageChange={setSubcategoryPage}
              onRowLimitChange={(limit) => {
                setSubcategoryRowLimit(limit);
                setSubcategoryPage(1);
              }}
            />
          </Card>
        </section>
      )}
    </div>
  );
}
