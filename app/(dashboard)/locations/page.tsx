"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";

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
  const [loading, setLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);

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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      timezone: String(formData.get("timezone") ?? "UTC"),
      is_active: true,
    };

    const response = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create location.");
      setLoading(false);
      return;
    }

    event.currentTarget.reset();
    await loadLocations();
    setLoading(false);
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

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 min-h-[24rem]">
          <h2 className="text-lg font-semibold">Add Location</h2>
          {capabilities === null ? (
            <p className="ims-empty mt-4">Loading permissions...</p>
          ) : capabilities.canManageLocations ? (
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <Input
                name="code"
                required
                placeholder="Code (e.g. NYC-01)"
                className="h-11"
              />
              <Input
                name="name"
                required
                placeholder="Location name"
                className="h-11"
              />
              <Input
                name="timezone"
                required
                defaultValue="UTC"
                placeholder="Timezone (e.g. America/New_York)"
                className="h-11"
              />
              <Button type="submit" disabled={loading} className="h-11 w-full rounded-2xl">
                {loading ? "Creating..." : "Create Location"}
              </Button>
            </form>
          ) : (
            <p className="ims-empty mt-4">
              Location management is restricted to administrators.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2 min-h-[24rem]">
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
              </tbody>
            </table>
            {locations.length === 0 ? (
              <p className="ims-empty mt-3">No locations found.</p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
