"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UserRow = {
  id: string;
  full_name: string;
  role: "admin" | "manager" | "staff";
  is_active: boolean;
  created_at: string;
};

type LocationRow = {
  id: string;
  code: string;
  name: string;
};

export default function UsersAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const json = (await response.json()) as { items?: UserRow[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Only admins can access this page.");
      return;
    }
    setUsers(json.items ?? []);
    const firstUserId = (json.items ?? [])[0]?.id ?? "";
    if (firstUserId) {
      setSelectedUserId((current) => current || firstUserId);
    }
  }, []);

  const loadLocations = useCallback(async () => {
    const response = await fetch("/api/locations");
    const json = (await response.json()) as { items?: LocationRow[] };
    setLocations(json.items ?? []);
  }, []);

  const loadUserLocations = useCallback(async (userId: string) => {
    const response = await fetch(`/api/admin/users/${userId}/locations`, {
      cache: "no-store",
    });
    const json = (await response.json()) as {
      items?: Array<{ location_id: string }>;
      error?: string;
    };

    if (!response.ok) {
      setError(json.error ?? "Failed to load user locations.");
      return;
    }

    setSelectedLocationIds((json.items ?? []).map((row) => row.location_id));
  }, []);

  useEffect(() => {
    Promise.all([loadUsers(), loadLocations()]).catch(() =>
      setError("Failed to load users."),
    );
  }, [loadUsers, loadLocations]);

  useEffect(() => {
    if (selectedUserId) {
      loadUserLocations(selectedUserId).catch(() =>
        setError("Failed to load user locations."),
      );
    }
  }, [selectedUserId, loadUserLocations]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      id: String(formData.get("id") ?? ""),
      full_name: String(formData.get("full_name") ?? ""),
      role: String(formData.get("role") ?? "staff"),
      is_active: formData.get("is_active") === "on",
    };

    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to save user.");
      setSaving(false);
      return;
    }

    await loadUsers();
    setSaving(false);
  }

  async function saveLocations() {
    if (!selectedUserId) return;

    setSaving(true);
    setError(null);
    const response = await fetch(`/api/admin/users/${selectedUserId}/locations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_ids: selectedLocationIds }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to save location access.");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  function toggleLocation(locationId: string) {
    setSelectedLocationIds((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-slate-600">
          Admin controls for role management and location assignment.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">User Profiles</h2>
          <div className="mt-4 space-y-3">
            {users.map((user) => (
              <form
                key={user.id}
                onSubmit={saveProfile}
                className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-5"
              >
                <input type="hidden" name="id" value={user.id} />
                <input
                  name="full_name"
                  defaultValue={user.full_name}
                  className="rounded border border-slate-300 px-2 py-1 text-sm md:col-span-2"
                />
                <select
                  name="role"
                  defaultValue={user.role}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="staff">staff</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input name="is_active" type="checkbox" defaultChecked={user.is_active} />
                  Active
                </label>
                <Button type="submit" variant="secondary" disabled={saving}>
                  Save
                </Button>
              </form>
            ))}
            {users.length === 0 ? (
              <p className="text-sm text-slate-500">No users found.</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Location Access</h2>
          <div className="mt-4 space-y-3">
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.role})
                </option>
              ))}
            </select>

            {selectedUser ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium">Assign locations for {selectedUser.full_name}</p>
                {locations.map((location) => (
                  <label key={location.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedLocationIds.includes(location.id)}
                      onChange={() => toggleLocation(location.id)}
                    />
                    {location.code} - {location.name}
                  </label>
                ))}
                <Button onClick={saveLocations} disabled={saving}>
                  Save Location Access
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
