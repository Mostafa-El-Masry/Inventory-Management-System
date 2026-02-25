"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Location = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  is_active: boolean;
};

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadLocations() {
    const response = await fetch("/api/locations", { cache: "no-store" });
    const json = (await response.json()) as { items?: Location[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load locations.");
      return;
    }
    setError(null);
    setLocations(json.items ?? []);
  }

  useEffect(() => {
    loadLocations().catch(() => setError("Failed to load locations."));
  }, []);

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

    (event.currentTarget as HTMLFormElement).reset();
    await loadLocations();
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Locations</h1>
        <p className="text-sm text-slate-600">
          Manage warehouse/store locations and operational timezones.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="text-lg font-semibold">Add Location</h2>
          <form onSubmit={handleCreate} className="mt-4 space-y-3">
            <input
              name="code"
              required
              placeholder="Code (e.g. NYC-01)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="name"
              required
              placeholder="Location name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="timezone"
              required
              defaultValue="UTC"
              placeholder="Timezone (e.g. America/New_York)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating..." : "Create Location"}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-lg font-semibold">Location List</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Timezone</th>
                  <th className="pb-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
                  <tr key={location.id} className="border-t border-slate-200">
                    <td className="py-2 pr-4 font-medium">{location.code}</td>
                    <td className="py-2 pr-4">{location.name}</td>
                    <td className="py-2 pr-4">{location.timezone}</td>
                    <td className="py-2">{location.is_active ? "Yes" : "No"}</td>
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
