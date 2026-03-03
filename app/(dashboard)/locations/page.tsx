"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Location = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  is_active: boolean;
};

type AuthMe = {
  capabilities: {
    canManageLocations: boolean;
    canArchiveLocations: boolean;
  };
};

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [capabilities, setCapabilities] = useState<AuthMe["capabilities"] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: "",
    timezone: "Asia/Kuwait",
    is_active: true,
  });

  const loadLocations = useCallback(async () => {
    const response = await fetch(
      `/api/locations?include_inactive=${showInactive ? "true" : "false"}`,
      { cache: "no-store" },
    );
    const json = (await response.json()) as { items?: Location[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load locations.");
      return;
    }
    setError(null);
    setLocations(json.items ?? []);
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

  useEffect(() => {
    loadAuth().catch(() => setError("Failed to load permissions."));
  }, [loadAuth]);

  useEffect(() => {
    loadLocations().catch(() => setError("Failed to load locations."));
  }, [loadLocations]);

  const canManageLocations = capabilities?.canManageLocations ?? false;
  const canCreate =
    newLocation.name.trim().length >= 2 && newLocation.timezone.trim().length >= 3;

  async function handleCreate() {
    if (!canManageLocations || !canCreate) {
      return;
    }

    setCreateLoading(true);
    setError(null);
    const payload = {
      name: newLocation.name.trim(),
      timezone: newLocation.timezone.trim(),
      is_active: newLocation.is_active,
    };

    const response = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create location.");
      setCreateLoading(false);
      return;
    }

    setNewLocation({
      name: "",
      timezone: "Asia/Kuwait",
      is_active: true,
    });
    await loadLocations();
    setCreateLoading(false);
  }

  async function setLocationActive(locationId: string, active: boolean) {
    setStateLoading(true);
    setError(null);
    const endpoint = active ? "activate" : "archive";
    const response = await fetch(`/api/locations/${locationId}/${endpoint}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${endpoint} location.`);
      setStateLoading(false);
      return;
    }

    await loadLocations();
    setStateLoading(false);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="ims-kicker">Master Data</p>
        <h1 className="ims-title text-[2.1rem]">Locations</h1>
        <p className="ims-subtitle">Archive-first location lifecycle with timezone management.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

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
                  <th>Code</th>
                  <th>Name</th>
                  <th>Timezone</th>
                  <th>Active</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
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
                            className="h-9"
                            disabled={stateLoading}
                            onClick={() => setLocationActive(location.id, false)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="h-9"
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
                {canManageLocations ? (
                  <tr className="ims-table-row">
                    <td className="font-medium text-[var(--text-muted)]">Auto</td>
                    <td>
                      <Input
                        value={newLocation.name}
                        onChange={(event) =>
                          setNewLocation((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Location name"
                        className="h-9"
                      />
                    </td>
                    <td>
                      <Input
                        value={newLocation.timezone}
                        onChange={(event) =>
                          setNewLocation((current) => ({
                            ...current,
                            timezone: event.target.value,
                          }))
                        }
                        placeholder="Timezone"
                        className="h-9"
                      />
                    </td>
                    <td>
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
                        {newLocation.is_active ? "Yes" : "No"}
                      </label>
                    </td>
                    <td>
                      <Button
                        className="h-9"
                        disabled={!canCreate || createLoading}
                        onClick={() => handleCreate()}
                      >
                        {createLoading ? "Creating..." : "Create"}
                      </Button>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {locations.length === 0 ? (
              <p className="ims-empty mt-3">No locations found.</p>
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
