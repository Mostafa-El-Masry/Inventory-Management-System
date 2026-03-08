"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { MasterCsvSync } from "@/components/master/master-csv-sync";
import { MasterPageHeader } from "@/components/master/master-page-header";
import {
  MasterTablePagination,
  RowLimitOption,
  paginateRows,
  parseRowLimitOption,
} from "@/components/master/master-table-pagination";
import {
  SortDirection,
  SortableTableHeader,
} from "@/components/master/sortable-table-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import type { ExportColumn } from "@/lib/export/contracts";
import {
  buildFilterStorageKey,
  readLocalFilterState,
  removeLocalFilterState,
  writeLocalFilterState,
} from "@/lib/utils/local-filter-storage";
import { compareTextValues } from "@/lib/utils/sort-values";
import { fetchJson } from "@/lib/utils/fetch-json";

type Supplier = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type SupplierSortKey = "code" | "name" | "phone" | "email" | "active";

const SUPPLIER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "is_active", label: "Active" },
];

export default function MasterSuppliersPage() {
  const { capabilities, userId: authUserId } = useDashboardSession();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [archivedFilterHydrated, setArchivedFilterHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editingSupplierName, setEditingSupplierName] = useState("");
  const [masterPanelOpen, setMasterPanelOpen] = useState(false);
  const [supplierRowLimit, setSupplierRowLimit] = useState<RowLimitOption>(10);
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierSortKey, setSupplierSortKey] = useState<SupplierSortKey>("code");
  const [supplierSortDirection, setSupplierSortDirection] =
    useState<SortDirection>("asc");
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    email: "",
    is_active: true,
  });
  const archivedFilterStorageKey = buildFilterStorageKey(authUserId, "master", "suppliers");

  const loadSuppliers = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchJson<{ items?: Supplier[] }>(
      `/api/suppliers?include_inactive=${showInactive ? "true" : "false"}`,
      {
        cache: "no-store",
        signal,
        fallbackError: "Failed to load suppliers.",
      },
    );
    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }
    setError(null);
    setSuppliers(result.data.items ?? []);
  }, [showInactive]);

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
    loadSuppliers(controller.signal).catch(() => setError("Failed to load suppliers."));
    return () => controller.abort();
  }, [archivedFilterHydrated, loadSuppliers]);

  const canManageSuppliers = capabilities.canManageSuppliers;
  const canCreate = newSupplier.name.trim().length >= 2;
  const canSaveEditedSupplierName = editingSupplierName.trim().length >= 2;
  const sortedSuppliers = useMemo(() => {
    const next = [...suppliers];
    next.sort((left, right) => {
      switch (supplierSortKey) {
        case "code":
          return compareTextValues(left.code, right.code, supplierSortDirection);
        case "name":
          return compareTextValues(left.name, right.name, supplierSortDirection);
        case "phone":
          return compareTextValues(left.phone, right.phone, supplierSortDirection);
        case "email":
          return compareTextValues(left.email, right.email, supplierSortDirection);
        case "active":
          return compareTextValues(left.is_active, right.is_active, supplierSortDirection);
      }
    });
    return next;
  }, [suppliers, supplierSortDirection, supplierSortKey]);
  const supplierPagination = paginateRows(sortedSuppliers, supplierRowLimit, supplierPage);

  useEffect(() => {
    setSupplierPage(1);
  }, [showInactive, supplierRowLimit, supplierSortDirection, supplierSortKey]);

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

  useEffect(() => {
    setSupplierPage((current) => Math.min(current, supplierPagination.totalPages));
  }, [supplierPagination.totalPages]);

  async function createSupplier() {
    if (!canManageSuppliers || !canCreate) {
      return;
    }

    setCreateLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await fetchJson<{ error?: string }>("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSupplier.name.trim(),
          phone: newSupplier.phone.trim() || null,
          email: newSupplier.email.trim() || null,
          is_active: newSupplier.is_active,
        }),
        fallbackError: "Failed to create supplier.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNewSupplier({
        name: "",
        phone: "",
        email: "",
        is_active: true,
      });
      setMessage("Supplier created.");
      await loadSuppliers();
    } finally {
      setCreateLoading(false);
    }
  }

  async function setSupplierActive(supplierId: string, active: boolean) {
    if (!canManageSuppliers) {
      return;
    }

    setStateLoading(true);
    setError(null);
    setMessage(null);
    try {
      const endpoint = active ? "activate" : "archive";
      const result = await fetchJson<{ error?: string }>(
        `/api/suppliers/${supplierId}/${endpoint}`,
        {
          method: "POST",
          fallbackError: `Failed to ${endpoint} supplier.`,
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(active ? "Supplier activated." : "Supplier archived.");
      await loadSuppliers();
    } finally {
      setStateLoading(false);
    }
  }

  async function hardDeleteSupplier(supplier: Supplier) {
    if (!canManageSuppliers) {
      return;
    }

    const confirmed = window.confirm(
      `Hard delete supplier "${supplier.name}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setStateLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/suppliers/${supplier.id}/hard-delete`,
        {
          method: "POST",
          fallbackError: "Failed to hard delete supplier.",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Supplier hard deleted.");
      await loadSuppliers();
    } finally {
      setStateLoading(false);
    }
  }

  function startEditingSupplier(supplier: Supplier) {
    setError(null);
    setMessage(null);
    setEditingSupplierId(supplier.id);
    setEditingSupplierName(supplier.name);
  }

  function cancelEditingSupplier() {
    setEditingSupplierId(null);
    setEditingSupplierName("");
  }

  async function saveSupplierName(supplierId: string) {
    if (!canManageSuppliers || !canSaveEditedSupplierName) {
      return;
    }

    setStateLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>("/api/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: supplierId,
          name: editingSupplierName,
        }),
        fallbackError: "Failed to update supplier.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Supplier updated.");
      cancelEditingSupplier();
      await loadSuppliers();
    } finally {
      setStateLoading(false);
    }
  }

  function toggleSupplierSort(nextKey: SupplierSortKey) {
    setSupplierSortDirection((current) =>
      supplierSortKey === nextKey ? (current === "asc" ? "desc" : "asc") : "asc",
    );
    setSupplierSortKey(nextKey);
  }

  return (
    <div className="space-y-6">
      <MasterPageHeader
        kicker="Master Data"
        title="Suppliers"
        subtitle="Supplier master and payable document ownership."
        showAction={canManageSuppliers}
        panelOpen={masterPanelOpen}
        onTogglePanel={() => setMasterPanelOpen((current) => !current)}
        openLabel="Open supplier actions"
        closeLabel="Close supplier actions"
      />

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {canManageSuppliers ? (
        masterPanelOpen ? (
          <div className="space-y-4">
            <MasterCsvSync
              entity="suppliers"
              canManage={canManageSuppliers}
              helperText="Keys by supplier code. Reimport updates matching codes and inserts missing ones."
              title="Suppliers"
              filenameBase="suppliers"
              columns={SUPPLIER_EXPORT_COLUMNS}
              rows={suppliers.map((supplier) => ({
                code: supplier.code,
                name: supplier.name,
                phone: supplier.phone ?? "",
                email: supplier.email ?? "",
                is_active: supplier.is_active,
              }))}
              filterSummary={[`Archived included: ${showInactive ? "Yes" : "No"}`]}
              onImported={async () => {
                await loadSuppliers();
              }}
            />

            <Card className="min-h-[12rem]">
              <h2 className="text-lg font-semibold">Create Supplier</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <Input
                  value={newSupplier.name}
                  onChange={(event) =>
                    setNewSupplier((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Supplier name"
                  className="ims-control-md"
                />
                <Input
                  value={newSupplier.phone}
                  onChange={(event) =>
                    setNewSupplier((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="Phone"
                  className="ims-control-md"
                />
                <Input
                  value={newSupplier.email}
                  onChange={(event) =>
                    setNewSupplier((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="Email"
                  className="ims-control-md"
                />
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newSupplier.is_active}
                      onChange={(event) =>
                        setNewSupplier((current) => ({
                          ...current,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    {newSupplier.is_active ? "Active" : "Inactive"}
                  </label>
                  <Button
                    className="ims-control-md"
                    disabled={!canCreate || createLoading}
                    onClick={() => createSupplier()}
                  >
                    {createLoading ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null
      ) : (
        <MasterCsvSync
          entity="suppliers"
          canManage={canManageSuppliers}
          helperText="Keys by supplier code. Reimport updates matching codes and inserts missing ones."
          title="Suppliers"
          filenameBase="suppliers"
          columns={SUPPLIER_EXPORT_COLUMNS}
          rows={suppliers.map((supplier) => ({
            code: supplier.code,
            name: supplier.name,
            phone: supplier.phone ?? "",
            email: supplier.email ?? "",
            is_active: supplier.is_active,
          }))}
          filterSummary={[`Archived included: ${showInactive ? "Yes" : "No"}`]}
          onImported={async () => {
            await loadSuppliers();
          }}
        />
      )}

      <Card className="min-h-[24rem]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Supplier List</h2>
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show archived
          </label>
        </div>

        <div className="mt-4 max-h-[34rem] overflow-auto">
          <table className="ims-table">
            <thead className="ims-table-head">
              <tr>
                <th>
                  <SortableTableHeader
                    label="Code"
                    active={supplierSortKey === "code"}
                    direction={supplierSortDirection}
                    onClick={() => toggleSupplierSort("code")}
                  />
                </th>
                <th>
                  <SortableTableHeader
                    label="Name"
                    active={supplierSortKey === "name"}
                    direction={supplierSortDirection}
                    onClick={() => toggleSupplierSort("name")}
                  />
                </th>
                <th>
                  <SortableTableHeader
                    label="Phone"
                    active={supplierSortKey === "phone"}
                    direction={supplierSortDirection}
                    onClick={() => toggleSupplierSort("phone")}
                  />
                </th>
                <th>
                  <SortableTableHeader
                    label="Email"
                    active={supplierSortKey === "email"}
                    direction={supplierSortDirection}
                    onClick={() => toggleSupplierSort("email")}
                  />
                </th>
                <th>
                  <SortableTableHeader
                    label="Active"
                    active={supplierSortKey === "active"}
                    direction={supplierSortDirection}
                    onClick={() => toggleSupplierSort("active")}
                  />
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {supplierPagination.items.map((supplier) => (
                <tr key={supplier.id} className="ims-table-row">
                  <td className="font-medium">{supplier.code}</td>
                  <td>
                    {editingSupplierId === supplier.id ? (
                      <Input
                        value={editingSupplierName}
                        onChange={(event) => setEditingSupplierName(event.target.value)}
                        placeholder="Supplier name"
                        className="ims-control-sm"
                      />
                    ) : (
                      supplier.name
                    )}
                  </td>
                  <td>{supplier.phone ?? "-"}</td>
                  <td>{supplier.email ?? "-"}</td>
                  <td>{supplier.is_active ? "Yes" : "No"}</td>
                  <td>
                    {canManageSuppliers ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {editingSupplierId === supplier.id ? (
                          <>
                            <Button
                              className="ims-control-sm"
                              disabled={!canSaveEditedSupplierName || stateLoading}
                              onClick={() => saveSupplierName(supplier.id)}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              className="ims-control-sm"
                              disabled={stateLoading}
                              onClick={() => cancelEditingSupplier()}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <RowActionsMenu
                            label={`Open actions for ${supplier.name}`}
                            disabled={stateLoading}
                            items={[
                              {
                                label: "Edit name",
                                onSelect: () => startEditingSupplier(supplier),
                              },
                              {
                                label: supplier.is_active ? "Archive" : "Activate",
                                onSelect: () =>
                                  setSupplierActive(supplier.id, !supplier.is_active),
                              },
                              {
                                label: "Delete",
                                destructive: true,
                                onSelect: () => hardDeleteSupplier(supplier),
                              },
                            ]}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">restricted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {suppliers.length === 0 ? (
            <p className="ims-empty mt-3">No suppliers found.</p>
          ) : null}
        </div>

        <MasterTablePagination
          totalItems={suppliers.length}
          currentPage={supplierPage}
          rowLimit={supplierRowLimit}
          onPageChange={setSupplierPage}
          onRowLimitChange={(limit) => {
            setSupplierRowLimit(limit);
            setSupplierPage(1);
          }}
        />
      </Card>
    </div>
  );
}
