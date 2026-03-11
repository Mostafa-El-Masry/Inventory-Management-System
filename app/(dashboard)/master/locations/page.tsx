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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type Location = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  is_active: boolean;
};

const LOCATION_COLUMN_DEFINITIONS = [
  { key: "code", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "timezone", label: "Timezone" },
  { key: "active", label: "Active" },
  { key: "action", label: "Action" },
] as const;

type LocationColumnKey = (typeof LOCATION_COLUMN_DEFINITIONS)[number]["key"];
type LocationSortKey = Exclude<LocationColumnKey, "action">;

function isLocationSortableColumn(key: LocationColumnKey): key is LocationSortKey {
  return key !== "action";
}

const LOCATION_DEFAULT_COLUMN_ORDER: LocationColumnKey[] = [
  "code",
  "name",
  "timezone",
  "active",
  "action",
];

const LOCATION_DEFAULT_COLUMN_VISIBILITY = buildDefaultColumnVisibility(
  LOCATION_DEFAULT_COLUMN_ORDER,
);

const LOCATION_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "code", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "timezone", label: "Timezone" },
  { key: "is_active", label: "Active" },
];

export default function LocationsPage() {
  const { capabilities, userId: authUserId } = useDashboardSession();
  const [locations, setLocations] = useState<Location[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [archivedFilterHydrated, setArchivedFilterHydrated] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [masterPanelOpen, setMasterPanelOpen] = useState(false);
  const [locationRowLimit, setLocationRowLimit] = useState<RowLimitOption>(10);
  const [locationPage, setLocationPage] = useState(1);
  const [locationSortKey, setLocationSortKey] = useState<LocationSortKey>("code");
  const [locationSortDirection, setLocationSortDirection] =
    useState<SortDirection>("asc");
  const [newLocation, setNewLocation] = useState({
    name: "",
    timezone: "",
    is_active: true,
  });
  const archivedFilterStorageKey = buildFilterStorageKey(authUserId, "master", "locations");
  const {
    orderedColumns: orderedLocationColumns,
    visibleColumns: visibleLocationColumns,
    columnVisibility: locationColumnVisibility,
    toggleColumnVisibility: toggleLocationColumnVisibility,
    moveColumn: moveLocationColumn,
    resetColumnPreferences: resetLocationColumnPreferences,
  } = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:locations:columns:${authUserId}`,
    columns: LOCATION_COLUMN_DEFINITIONS,
    defaultOrder: LOCATION_DEFAULT_COLUMN_ORDER,
    defaultVisibility: LOCATION_DEFAULT_COLUMN_VISIBILITY,
  });

  const loadLocations = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchJson<{ items?: Location[] }>(
      `/api/locations?include_inactive=${showInactive ? "true" : "false"}`,
      {
        cache: "no-store",
        signal,
        fallbackError: "Failed to load locations.",
      },
    );
    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setError(null);
    setLocations(result.data.items ?? []);
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

    setLocationsLoading(true);
    loadLocations(controller.signal)
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load locations.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLocationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [archivedFilterHydrated, loadLocations]);

  const canCreateLocation = capabilities.master.locations.create;
  const canImportLocations = capabilities.master.locations.import;
  const canArchiveLocation = capabilities.master.locations.archive;
  const canShowLocationPanel = canCreateLocation || canImportLocations;
  const showLocationLoadingRows = !archivedFilterHydrated || locationsLoading;
  const canCreate =
    newLocation.name.trim().length >= 2 && newLocation.timezone.trim().length >= 3;
  const sortedLocations = useMemo(() => {
    const next = [...locations];
    next.sort((left, right) => {
      switch (locationSortKey) {
        case "code":
          return compareTextValues(left.code, right.code, locationSortDirection);
        case "name":
          return compareTextValues(left.name, right.name, locationSortDirection);
        case "timezone":
          return compareTextValues(left.timezone, right.timezone, locationSortDirection);
        case "active":
          return compareTextValues(left.is_active, right.is_active, locationSortDirection);
      }
    });
    return next;
  }, [locationSortDirection, locationSortKey, locations]);
  const locationPagination = paginateRows(sortedLocations, locationRowLimit, locationPage);
  const locationExportRows = locations.map((location) => ({
    code: location.code,
    name: location.name,
    timezone: location.timezone,
    is_active: location.is_active,
  }));
  const locationFilterSummary = [`Disabled included: ${showInactive ? "Yes" : "No"}`];

  useEffect(() => {
    setLocationPage(1);
  }, [showInactive, locationRowLimit, locationSortDirection, locationSortKey]);

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
    setLocationPage((current) => Math.min(current, locationPagination.totalPages));
  }, [locationPagination.totalPages]);

  async function handleCreate() {
    if (!canCreateLocation || !canCreate) {
      return;
    }

    setCreateLoading(true);
    setError(null);
    try {
      const payload = {
        name: newLocation.name.trim(),
        timezone: newLocation.timezone.trim(),
        is_active: newLocation.is_active,
      };

      const result = await fetchJson<{ error?: string }>("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackError: "Failed to create location.",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNewLocation({
        name: "",
        timezone: "",
        is_active: true,
      });
      await loadLocations();
    } finally {
      setCreateLoading(false);
    }
  }

  async function setLocationActive(locationId: string, active: boolean) {
    if (!canArchiveLocation) {
      return;
    }

    setStateLoading(true);
    setError(null);
    try {
      const endpoint = active ? "activate" : "archive";
      const result = await fetchJson<{ error?: string }>(
        `/api/locations/${locationId}/${endpoint}`,
        {
          method: "POST",
          fallbackError: `Failed to ${endpoint} location.`,
        },
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await loadLocations();
    } finally {
      setStateLoading(false);
    }
  }

  function toggleLocationSort(nextKey: LocationSortKey) {
    setLocationSortDirection((current) =>
      locationSortKey === nextKey ? (current === "asc" ? "desc" : "asc") : "asc",
    );
    setLocationSortKey(nextKey);
  }

  function renderLocationCell(location: Location, columnKey: LocationColumnKey) {
    if (columnKey === "code") {
      return <span className="font-medium">{location.code}</span>;
    }

    if (columnKey === "name") {
      return location.name;
    }

    if (columnKey === "timezone") {
      return location.timezone;
    }

    if (columnKey === "active") {
      return location.is_active ? "Yes" : "No";
    }

    if (!canArchiveLocation) {
      return <span className="text-xs text-[var(--text-muted)]">--</span>;
    }

    return (
      <RowActionsMenu
        label={`Open actions for ${location.name}`}
        disabled={stateLoading}
        items={[
          {
            label: location.is_active ? "Archive" : "Activate",
            onSelect: () => setLocationActive(location.id, !location.is_active),
          },
        ]}
      />
    );
  }

  return (
    <div className="space-y-6">
      <MasterPageHeader
        title="Locations"
        subtitle="Archive-first location lifecycle with timezone management."
        showAction={canShowLocationPanel}
        panelOpen={masterPanelOpen}
        onTogglePanel={() => setMasterPanelOpen((current) => !current)}
        openLabel="Open location actions"
        closeLabel="Close location actions"
      />

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      {canShowLocationPanel ? (
          <MasterPanelReveal open={masterPanelOpen} className="space-y-4">
            <MasterCsvSync
              entity="locations"
              canManage={canImportLocations}
              onImported={async () => {
                await loadLocations();
              }}
            >
              {canCreateLocation ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-end">
                  <Input
                    value={newLocation.name}
                    onChange={(event) =>
                      setNewLocation((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Location name"
                    className="ims-control-md"
                  />
                  <Input
                    value={newLocation.timezone}
                    onChange={(event) =>
                      setNewLocation((current) => ({
                        ...current,
                        timezone: event.target.value,
                      }))
                    }
                    placeholder="Timezone"
                    className="ims-control-md"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newLocation.is_active}
                        onChange={(event) =>
                          setNewLocation((current) => ({
                            ...current,
                            is_active: event.target.checked,
                          }))
                        }
                      />
                      {newLocation.is_active ? "Active" : "Inactive"}
                    </label>
                    <Button
                      className="ims-control-md"
                      disabled={!canCreate || createLoading}
                      onClick={() => handleCreate()}
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
          entity="locations"
          canManage={canImportLocations}
          onImported={async () => {
            await loadLocations();
          }}
        />
      )}

      <section>
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
              <MasterRowLimitControl
                value={locationRowLimit}
                onChange={(limit) => {
                  setLocationRowLimit(limit);
                  setLocationPage(1);
                }}
              />
              <h2 className="min-w-0 text-lg font-semibold">Location List</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MasterListSettingsMenu
                orderedColumns={orderedLocationColumns}
                columnVisibility={locationColumnVisibility}
                onToggleColumn={toggleLocationColumnVisibility}
                onMoveColumn={moveLocationColumn}
                onResetColumns={resetLocationColumnPreferences}
                columnsHelperText="Toggle and reorder location columns."
                showInactive={showInactive}
                onShowInactiveChange={(pressed) => setShowInactive(pressed)}
                exportTitle="Locations"
                exportFilenameBase="locations"
                exportColumns={LOCATION_EXPORT_COLUMNS}
                exportRows={locationExportRows}
                exportFilterSummary={locationFilterSummary}
                exportEmptyMessage="No locations available."
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto overflow-y-visible">
            <table className="ims-table ims-master-table" aria-busy={showLocationLoadingRows}>
              <thead className="ims-table-head">
                <tr>
                  {visibleLocationColumns.map((column) => (
                    <th key={column.key} data-column-key={column.key}>
                      {!isLocationSortableColumn(column.key) ? column.label : (() => {
                        const sortKey = column.key;
                        return (
                          <SortableTableHeader
                            label={column.label}
                            active={locationSortKey === sortKey}
                            direction={locationSortDirection}
                            onClick={() => toggleLocationSort(sortKey)}
                          />
                        );
                      })()}
                    </th>
                  ))}
                </tr>
              </thead>
              {showLocationLoadingRows ? (
                <MasterTableLoadingRows
                  columns={visibleLocationColumns}
                  rowLimit={locationRowLimit}
                />
              ) : (
                <tbody>
                  {locationPagination.items.map((location) => (
                    <tr key={location.id} className="ims-table-row">
                      {visibleLocationColumns.map((column) => (
                        <td
                          key={`${location.id}-${column.key}`}
                          data-column-key={column.key}
                        >
                          {renderLocationCell(location, column.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
            {!showLocationLoadingRows && !error && locations.length === 0 ? (
              <p className="ims-empty mt-3">No locations found.</p>
            ) : null}
          </div>

          <MasterTablePagination
            totalItems={locations.length}
            currentPage={locationPage}
            rowLimit={locationRowLimit}
            onPageChange={setLocationPage}
            loading={showLocationLoadingRows}
          />
        </Card>
      </section>
    </div>
  );
}
