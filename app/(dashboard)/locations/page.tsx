"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
        <h1 className="text-2xl font-bold">Locations</h1>
        <p className="text-sm text-slate-600">
          Archive-first location lifecycle with timezone management.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 min-h-[24rem]">
          <h2 className="text-lg font-semibold">Add Location</h2>
          {capabilities === null ? (
            <p className="mt-4 text-sm text-slate-600">Loading permissions...</p>
          ) : capabilities.canManageLocations ? (
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <input
                name="code"
                required
                placeholder="Code (e.g. NYC-01)"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                name="name"
                required
                placeholder="Location name"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                name="timezone"
                required
                defaultValue="UTC"
                placeholder="Timezone (e.g. America/New_York)"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <Button type="submit" disabled={loading} className="h-11 w-full">
                {loading ? "Creating..." : "Create Location"}
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              Location management is restricted to administrators.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2 min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Location List</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Show archived
            </label>
          </div>

          <div className="mt-4 max-h-[32rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Timezone</th>
                  <th className="pb-2 pr-4">Active</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
                  <tr key={location.id} className="border-t border-slate-200">
                    <td className="py-2 pr-4 font-medium">{location.code}</td>
                    <td className="py-2 pr-4">{location.name}</td>
                    <td className="py-2 pr-4">{location.timezone}</td>
                    <td className="py-2 pr-4">{location.is_active ? "Yes" : "No"}</td>
                    <td className="py-2">
                      {capabilities?.canArchiveLocations ? (
                        location.is_active ? (
                          <Button
                            variant="secondary"
                            disabled={stateLoading}
                            onClick={() => setLocationActive(location.id, false)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            disabled={stateLoading}
                            onClick={() => setLocationActive(location.id, true)}
                          >
                            Activate
                          </Button>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">restricted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {locations.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No locations found.</p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
