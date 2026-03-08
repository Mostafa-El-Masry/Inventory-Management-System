"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { MasterCsvSync } from "@/components/master/master-csv-sync";
import { MasterPageHeader } from "@/components/master/master-page-header";
import {
  MasterTablePagination,
  RowLimitOption,
  paginateRows,
} from "@/components/master/master-table-pagination";
import {
  SortDirection,
  SortableTableHeader,
} from "@/components/master/sortable-table-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type LocationSortKey = "code" | "name" | "timezone" | "active";

const LOCATION_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "timezone", label: "Timezone" },
  { key: "is_active", label: "Active" },
];

export default function LocationsPage() {
  const { capabilities, userId: authUserId } = useDashboardSession();
  const [locations, setLocations] = useState<Location[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [archivedFilterHydrated, setArchivedFilterHydrated] = useState(false);
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
    timezone: "Asia/Kuwait",
    is_active: true,
  });
  const archivedFilterStorageKey = buildFilterStorageKey(authUserId, "master", "locations");

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
    loadLocations(controller.signal).catch(() => setError("Failed to load locations."));
    return () => controller.abort();
  }, [archivedFilterHydrated, loadLocations]);

  const canManageLocations = capabilities.canManageLocations;
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
    if (!canManageLocations || !canCreate) {
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
        timezone: "Asia/Kuwait",
        is_active: true,
      });
      await loadLocations();
    } finally {
      setCreateLoading(false);
    }
  }

  async function setLocationActive(locationId: string, active: boolean) {
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

  return (
    <div className="space-y-6">
      <MasterPageHeader
        kicker="Master Data"
        title="Locations"
        subtitle="Archive-first location lifecycle with timezone management."
        showAction={canManageLocations}
        panelOpen={masterPanelOpen}
        onTogglePanel={() => setMasterPanelOpen((current) => !current)}
        openLabel="Open location actions"
        closeLabel="Close location actions"
      />

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      {canManageLocations ? (
        masterPanelOpen ? (
          <div className="space-y-4">
            <MasterCsvSync
              entity="locations"
              canManage={canManageLocations}
              helperText="Keys by location code. Rows missing from file are left unchanged."
              title="Locations"
              filenameBase="locations"
              columns={LOCATION_EXPORT_COLUMNS}
              rows={locations.map((location) => ({
                code: location.code,
                name: location.name,
                timezone: location.timezone,
                is_active: location.is_active,
              }))}
              filterSummary={[`Archived included: ${showInactive ? "Yes" : "No"}`]}
              onImported={async () => {
                await loadLocations();
              }}
            />

            <Card className="min-h-[12rem]">
              <h2 className="text-lg font-semibold">Create Location</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
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
                <div className="flex items-center justify-between gap-3 lg:col-span-2">
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
            </Card>
          </div>
        ) : null
      ) : (
        <MasterCsvSync
          entity="locations"
          canManage={canManageLocations}
          helperText="Keys by location code. Rows missing from file are left unchanged."
          title="Locations"
          filenameBase="locations"
          columns={LOCATION_EXPORT_COLUMNS}
          rows={locations.map((location) => ({
            code: location.code,
            name: location.name,
            timezone: location.timezone,
            is_active: location.is_active,
          }))}
          filterSummary={[`Archived included: ${showInactive ? "Yes" : "No"}`]}
          onImported={async () => {
            await loadLocations();
          }}
        />
      )}

      <section>
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Location List</h2>
            <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Show archived
            </label>
          </div>

          <div className="mt-4 max-h-[32rem] overflow-auto">
            <table className="ims-table">
              <thead className="ims-table-head">
                <tr>
                  <th>
                    <SortableTableHeader
                      label="Code"
                      active={locationSortKey === "code"}
                      direction={locationSortDirection}
                      onClick={() => toggleLocationSort("code")}
                    />
                  </th>
                  <th>
                    <SortableTableHeader
                      label="Name"
                      active={locationSortKey === "name"}
                      direction={locationSortDirection}
                      onClick={() => toggleLocationSort("name")}
                    />
                  </th>
                  <th>
                    <SortableTableHeader
                      label="Timezone"
                      active={locationSortKey === "timezone"}
                      direction={locationSortDirection}
                      onClick={() => toggleLocationSort("timezone")}
                    />
                  </th>
                  <th>
                    <SortableTableHeader
                      label="Active"
                      active={locationSortKey === "active"}
                      direction={locationSortDirection}
                      onClick={() => toggleLocationSort("active")}
                    />
                  </th>
                  <th>Action</th>
                </tr>
            </thead>
            <tbody>
                {locationPagination.items.map((location) => (
                  <tr key={location.id} className="ims-table-row">
                    <td className="font-medium">{location.code}</td>
                    <td>{location.name}</td>
                    <td>{location.timezone}</td>
                    <td>{location.is_active ? "Yes" : "No"}</td>
                    <td>
                      {capabilities?.canArchiveLocations ? (
                        location.is_active ? (
                          <Button
                            variant="secondary"
                            className="ims-control-sm"
                            disabled={stateLoading}
                            onClick={() => setLocationActive(location.id, false)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="ims-control-sm"
                            disabled={stateLoading}
                            onClick={() => setLocationActive(location.id, true)}
                          >
                            Activate
                          </Button>
                        )
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">restricted</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {locations.length === 0 ? (
            <p className="ims-empty mt-3">No locations found.</p>
          ) : null}
        </div>

        <MasterTablePagination
          totalItems={locations.length}
          currentPage={locationPage}
          rowLimit={locationRowLimit}
          onPageChange={setLocationPage}
          onRowLimitChange={(limit) => {
            setLocationRowLimit(limit);
            setLocationPage(1);
          }}
        />
      </Card>
    </section>
  </div>
  );
}
