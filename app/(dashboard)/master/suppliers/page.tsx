"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { MasterCsvSync } from "@/components/master/master-csv-sync";
import { MasterListSettingsMenu } from "@/components/master/master-list-settings-menu";
import { MasterPageHeader } from "@/components/master/master-page-header";
import { MasterPanelReveal } from "@/components/master/master-panel-reveal";
import { MasterTableLoadingRows } from "@/components/master/master-table-loading";
import {
  MasterRowLimitControl,
  MasterTablePagination,
  RowLimitOption,
  paginateRows,
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

const SUPPLIER_COLUMN_DEFINITIONS = [
  { key: "code", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "active", label: "Active" },
  { key: "action", label: "Action" },
] as const;

type SupplierColumnKey = (typeof SUPPLIER_COLUMN_DEFINITIONS)[number]["key"];
type SupplierSortKey = Exclude<SupplierColumnKey, "action">;

function isSupplierSortableColumn(key: SupplierColumnKey): key is SupplierSortKey {
  return key !== "action";
}

const SUPPLIER_DEFAULT_COLUMN_ORDER: SupplierColumnKey[] = [
  "code",
  "name",
  "phone",
  "email",
  "active",
  "action",
];

const SUPPLIER_DEFAULT_COLUMN_VISIBILITY = buildDefaultColumnVisibility(
  SUPPLIER_DEFAULT_COLUMN_ORDER,
);

const SUPPLIER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "code", label: "SKU" },
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
  const [suppliersLoading, setSuppliersLoading] = useState(false);
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
  const {
    orderedColumns: orderedSupplierColumns,
    visibleColumns: visibleSupplierColumns,
    columnVisibility: supplierColumnVisibility,
    toggleColumnVisibility: toggleSupplierColumnVisibility,
    moveColumn: moveSupplierColumn,
    resetColumnPreferences: resetSupplierColumnPreferences,
  } = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:suppliers:columns:${authUserId}`,
    columns: SUPPLIER_COLUMN_DEFINITIONS,
    defaultOrder: SUPPLIER_DEFAULT_COLUMN_ORDER,
    defaultVisibility: SUPPLIER_DEFAULT_COLUMN_VISIBILITY,
  });

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
    let cancelled = false;

    setSuppliersLoading(true);
    loadSuppliers(controller.signal)
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load suppliers.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSuppliersLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [archivedFilterHydrated, loadSuppliers]);

  const canCreateSupplier = capabilities.master.suppliers.create;
  const canImportSuppliers = capabilities.master.suppliers.import;
  const canEditSupplier = capabilities.master.suppliers.edit;
  const canArchiveSupplier = capabilities.master.suppliers.archive;
  const canDeleteSupplier = capabilities.master.suppliers.delete;
  const canShowSupplierPanel = canCreateSupplier || canImportSuppliers;
  const canCreate = newSupplier.name.trim().length >= 2;
  const canSaveEditedSupplierName =
    canEditSupplier && editingSupplierName.trim().length >= 2;
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
  const supplierExportRows = suppliers.map((supplier) => ({
    code: supplier.code,
    name: supplier.name,
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    is_active: supplier.is_active,
  }));
  const supplierFilterSummary = [`Disabled included: ${showInactive ? "Yes" : "No"}`];

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

  useEffect(() => {
    if ((!supplierColumnVisibility.action || !canEditSupplier) && editingSupplierId) {
      cancelEditingSupplier();
    }
  }, [canEditSupplier, editingSupplierId, supplierColumnVisibility.action]);

  const showSupplierLoadingRows = !archivedFilterHydrated || suppliersLoading;

  async function createSupplier() {
    if (!canCreateSupplier || !canCreate) {
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
    if (!canArchiveSupplier) {
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
    if (!canDeleteSupplier) {
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
    if (!canEditSupplier || !canSaveEditedSupplierName) {
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

  function renderSupplierCell(supplier: Supplier, columnKey: SupplierColumnKey) {
    if (columnKey === "code") {
      return <span className="font-medium">{supplier.code}</span>;
    }

    if (columnKey === "name") {
      if (editingSupplierId === supplier.id) {
        return (
          <Input
            value={editingSupplierName}
            onChange={(event) => setEditingSupplierName(event.target.value)}
            placeholder="Supplier name"
            className="ims-control-sm"
          />
        );
      }

      return supplier.name;
    }

    if (columnKey === "phone") {
      return supplier.phone ?? "-";
    }

    if (columnKey === "email") {
      return supplier.email ?? "-";
    }

    if (columnKey === "active") {
      return supplier.is_active ? "Yes" : "No";
    }

    const actionItems = [];

    if (canEditSupplier) {
      actionItems.push({
        label: "Edit name",
        onSelect: () => startEditingSupplier(supplier),
      });
    }

    if (canArchiveSupplier) {
      actionItems.push({
        label: supplier.is_active ? "Archive" : "Activate",
        onSelect: () => setSupplierActive(supplier.id, !supplier.is_active),
      });
    }

    if (canDeleteSupplier) {
      actionItems.push({
        label: "Delete",
        destructive: true,
        onSelect: () => hardDeleteSupplier(supplier),
      });
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        {editingSupplierId === supplier.id && canEditSupplier ? (
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
        ) : actionItems.length > 0 ? (
          <RowActionsMenu
            label={`Open actions for ${supplier.name}`}
            disabled={stateLoading}
            items={actionItems}
          />
        ) : (
          <span className="text-xs text-[var(--text-muted)]">--</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MasterPageHeader
        title="Suppliers"
        showAction={canShowSupplierPanel}
        panelOpen={masterPanelOpen}
        onTogglePanel={() => setMasterPanelOpen((current) => !current)}
        openLabel="Open supplier actions"
        closeLabel="Close supplier actions"
      />

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {canShowSupplierPanel ? (
          <MasterPanelReveal open={masterPanelOpen} className="space-y-4">
            <MasterCsvSync
              entity="suppliers"
              canManage={canImportSuppliers}
              onImported={async () => {
                await loadSuppliers();
              }}
            >
              {canCreateSupplier ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
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
              ) : null}
            </MasterCsvSync>
          </MasterPanelReveal>
      ) : (
        <MasterCsvSync
          entity="suppliers"
          canManage={canImportSuppliers}
          onImported={async () => {
            await loadSuppliers();
          }}
        />
      )}

      <Card className="min-h-[24rem]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
            <MasterRowLimitControl
              value={supplierRowLimit}
              onChange={(limit) => {
                setSupplierRowLimit(limit);
                setSupplierPage(1);
              }}
            />
            <h2 className="min-w-0 text-lg font-semibold">Supplier List</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MasterListSettingsMenu
              orderedColumns={orderedSupplierColumns}
              columnVisibility={supplierColumnVisibility}
              onToggleColumn={toggleSupplierColumnVisibility}
              onMoveColumn={moveSupplierColumn}
              onResetColumns={resetSupplierColumnPreferences}
              columnsHelperText="Toggle and reorder supplier columns."
              showInactive={showInactive}
              onShowInactiveChange={(pressed) => setShowInactive(pressed)}
              exportTitle="Suppliers"
              exportFilenameBase="suppliers"
              exportColumns={SUPPLIER_EXPORT_COLUMNS}
              exportRows={supplierExportRows}
              exportFilterSummary={supplierFilterSummary}
              exportEmptyMessage="No suppliers available."
            />
          </div>
        </div>

          <div className="mt-4 overflow-x-auto overflow-y-visible">
            <table className="ims-table ims-master-table" aria-busy={showSupplierLoadingRows}>
              <thead className="ims-table-head">
                <tr>
                  {visibleSupplierColumns.map((column) => (
                    <th key={column.key} data-column-key={column.key}>
                      {!isSupplierSortableColumn(column.key) ? column.label : (() => {
                        const sortKey = column.key;
                        return (
                          <SortableTableHeader
                            label={column.label}
                            active={supplierSortKey === sortKey}
                            direction={supplierSortDirection}
                            onClick={() => toggleSupplierSort(sortKey)}
                          />
                        );
                      })()}
                    </th>
                  ))}
                </tr>
              </thead>
              {showSupplierLoadingRows ? (
                <MasterTableLoadingRows
                  columns={visibleSupplierColumns}
                  rowLimit={supplierRowLimit}
                />
              ) : (
                <tbody>
                  {supplierPagination.items.map((supplier) => (
                    <tr key={supplier.id} className="ims-table-row">
                      {visibleSupplierColumns.map((column) => (
                        <td
                          key={`${supplier.id}-${column.key}`}
                          data-column-key={column.key}
                        >
                          {renderSupplierCell(supplier, column.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
            {!showSupplierLoadingRows && !error && suppliers.length === 0 ? (
              <p className="ims-empty mt-3">No suppliers found.</p>
            ) : null}
          </div>

        <MasterTablePagination
          totalItems={suppliers.length}
          currentPage={supplierPage}
          rowLimit={supplierRowLimit}
          onPageChange={setSupplierPage}
          loading={showSupplierLoadingRows}
        />
      </Card>
    </div>
  );
}
