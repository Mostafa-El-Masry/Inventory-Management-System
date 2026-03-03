"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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
  };
};

export function TaxonomySection({ section }: { section: "categories" | "subcategories" }) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<AuthMe["capabilities"] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [categoryRowLimit, setCategoryRowLimit] = useState<RowLimitOption>(10);
  const [subcategoryRowLimit, setSubcategoryRowLimit] = useState<RowLimitOption>(10);
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
      setError(categoriesJson.error ?? "Failed to load categories.");
      setTaxonomyLoading(false);
      return;
    }

    const subcategoriesJson = (await subcategoriesResponse.json()) as {
      items?: ProductSubcategory[];
      error?: string;
    };
    if (!subcategoriesResponse.ok) {
      setError(subcategoriesJson.error ?? "Failed to load subcategories.");
      setTaxonomyLoading(false);
      return;
    }

    setError(null);
    setCategories(categoriesJson.items ?? []);
    setSubcategories(subcategoriesJson.items ?? []);
    setTaxonomyLoading(false);
  }, []);

  useEffect(() => {
    loadAuth().catch(() => setError("Failed to load permissions."));
  }, [loadAuth]);

  useEffect(() => {
    loadTaxonomy().catch(() => setError("Failed to load taxonomy."));
  }, [loadTaxonomy]);

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

  const canManageTaxonomy = capabilities?.canCreateProductMaster ?? false;

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
  const visibleCategories = useMemo(
    () => sliceRowsByLimit(categories, categoryRowLimit),
    [categories, categoryRowLimit],
  );
  const visibleSubcategories = useMemo(
    () => sliceRowsByLimit(subcategories, subcategoryRowLimit),
    [subcategories, subcategoryRowLimit],
  );

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
    setMessage("Category created.");
    await loadTaxonomy();
    setTaxonomySaving(false);
  }

  async function createSubcategory() {
    if (!canManageTaxonomy || !canCreateSubcategory) {
      return;
    }

    setTaxonomySaving(true);
    setError(null);
    setMessage(null);
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
    setMessage("Subcategory created.");
    await loadTaxonomy();
    setTaxonomySaving(false);
  }

  async function setCategoryActive(categoryId: string, active: boolean) {
    if (!canManageTaxonomy) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);
    const endpoint = active ? "activate" : "archive";
    const response = await fetch(`/api/product-categories/${categoryId}/${endpoint}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${endpoint} category.`);
      setActionLoading(false);
      return;
    }

    setMessage(active ? "Category activated." : "Category archived.");
    await loadTaxonomy();
    setActionLoading(false);
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
    const response = await fetch(`/api/product-categories/${category.id}/hard-delete`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to hard delete category.");
      setActionLoading(false);
      return;
    }

    setMessage("Category hard deleted.");
    await loadTaxonomy();
    setActionLoading(false);
  }

  async function setSubcategoryActive(subcategoryId: string, active: boolean) {
    if (!canManageTaxonomy) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);
    const endpoint = active ? "activate" : "archive";
    const response = await fetch(`/api/product-subcategories/${subcategoryId}/${endpoint}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${endpoint} subcategory.`);
      setActionLoading(false);
      return;
    }

    setMessage(active ? "Subcategory activated." : "Subcategory archived.");
    await loadTaxonomy();
    setActionLoading(false);
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
    const response = await fetch(
      `/api/product-subcategories/${subcategory.id}/hard-delete`,
      {
        method: "POST",
      },
    );
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to hard delete subcategory.");
      setActionLoading(false);
      return;
    }

    setMessage("Subcategory hard deleted.");
    await loadTaxonomy();
    setActionLoading(false);
  }

  const isCategoriesSection = section === "categories";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="ims-kicker">Master Data</p>
        <h1 className="ims-title text-[2.1rem]">
          {isCategoriesSection ? "Categories" : "Subcategories"}
        </h1>
        <p className="ims-subtitle">
          {isCategoriesSection
            ? "Manage product categories."
            : "Manage product subcategories."}
        </p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {isCategoriesSection ? (
        <section>
          <Card className="min-h-[28rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Categories</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  Rows
                  <Select
                    className="h-8 w-[5.25rem]"
                    value={String(categoryRowLimit)}
                    onChange={(event) =>
                      setCategoryRowLimit(parseRowLimitOption(event.target.value))
                    }
                  >
                    <option value="10">10</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="all">All</option>
                  </Select>
                </label>
                <span className="text-xs text-[var(--text-muted)]">
                  {taxonomyLoading
                    ? "Refreshing..."
                    : `${visibleCategories.length} of ${categories.length}`}
                </span>
              </div>
            </div>

            {canManageTaxonomy ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
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
            ) : (
              <p className="ims-empty mt-4 text-sm">restricted</p>
            )}

            <div className="mt-4 max-h-[23rem] overflow-auto">
              <table className="ims-table">
                <thead className="ims-table-head">
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Active</th>
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
                          <div className="flex flex-wrap items-center gap-2">
                            {category.is_active ? (
                              <Button
                                variant="secondary"
                                className="h-9"
                                disabled={actionLoading}
                                onClick={() => setCategoryActive(category.id, false)}
                              >
                                Archive
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                className="h-9"
                                disabled={actionLoading}
                                onClick={() => setCategoryActive(category.id, true)}
                              >
                                Activate
                              </Button>
                            )}
                            <Button
                              variant="danger"
                              className="h-9"
                              disabled={actionLoading}
                              onClick={() => hardDeleteCategory(category)}
                            >
                              Delete
                            </Button>
                          </div>
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
          </Card>
        </section>
      ) : (
        <section>
          <Card className="min-h-[28rem]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Subcategories</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  Rows
                  <Select
                    className="h-8 w-[5.25rem]"
                    value={String(subcategoryRowLimit)}
                    onChange={(event) =>
                      setSubcategoryRowLimit(parseRowLimitOption(event.target.value))
                    }
                  >
                    <option value="10">10</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="all">All</option>
                  </Select>
                </label>
                <span className="text-xs text-[var(--text-muted)]">
                  {taxonomyLoading
                    ? "Refreshing..."
                    : `${visibleSubcategories.length} of ${subcategories.length}`}
                </span>
              </div>
            </div>

            {canManageTaxonomy ? (
              <div className="mt-4 space-y-2">
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
            ) : (
              <p className="ims-empty mt-4 text-sm">restricted</p>
            )}

            <div className="mt-4 max-h-[23rem] overflow-auto">
              <table className="ims-table">
                <thead className="ims-table-head">
                  <tr>
                    <th>Parent Category</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Active</th>
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
                            <div className="flex flex-wrap items-center gap-2">
                              {subcategory.is_active ? (
                                <Button
                                  variant="secondary"
                                  className="h-9"
                                  disabled={actionLoading}
                                  onClick={() => setSubcategoryActive(subcategory.id, false)}
                                >
                                  Archive
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  className="h-9"
                                  disabled={actionLoading}
                                  onClick={() => setSubcategoryActive(subcategory.id, true)}
                                >
                                  Activate
                                </Button>
                              )}
                              <Button
                                variant="danger"
                                className="h-9"
                                disabled={actionLoading}
                                onClick={() => hardDeleteSubcategory(subcategory)}
                              >
                                Delete
                              </Button>
                            </div>
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
          </Card>
        </section>
      )}
    </div>
  );
}
