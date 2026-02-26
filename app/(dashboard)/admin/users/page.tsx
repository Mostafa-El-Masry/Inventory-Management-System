"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type UserRow = {
  id: string;
  email: string | null;
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

type ProvisionMode = "invite" | "password";

export default function UsersAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [createMode, setCreateMode] = useState<ProvisionMode>("invite");
  const [createLocationIds, setCreateLocationIds] = useState<string[]>([]);
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

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      full_name: String(formData.get("full_name") ?? ""),
      role: String(formData.get("role") ?? "staff"),
      mode: createMode,
      password:
        createMode === "password"
          ? String(formData.get("password") ?? "")
          : undefined,
      location_ids: createLocationIds,
    };

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create user.");
      setSaving(false);
      return;
    }

    event.currentTarget.reset();
    setCreateLocationIds([]);
    await loadUsers();
    if (json.id) {
      setSelectedUserId(json.id);
      await loadUserLocations(json.id);
    }
    setSaving(false);
  }

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

  async function setUserEnabled(userId: string, enabled: boolean) {
    setSaving(true);
    setError(null);
    const endpoint = enabled ? "enable" : "disable";
    const response = await fetch(`/api/admin/users/${userId}/${endpoint}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(json.error ?? `Failed to ${endpoint} user.`);
      setSaving(false);
      return;
    }

    await loadUsers();
    if (selectedUserId) {
      await loadUserLocations(selectedUserId);
    }
    setSaving(false);
  }

  async function resendInvite(userId: string) {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/admin/users/${userId}/invite-resend`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(json.error ?? "Failed to send invite/reset email.");
      setSaving(false);
      return;
    }

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

  function toggleCreateLocation(locationId: string) {
    setCreateLocationIds((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Administration</p>
        <h1 className="ims-title text-[2.1rem]">Users</h1>
        <p className="ims-subtitle">
          Production user lifecycle controls: provisioning, role updates, status, and
          location access.
        </p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="overflow-hidden">
        <h2 className="text-lg font-semibold">Create User</h2>
        <form onSubmit={createUser} className="mt-4 space-y-3">
          <div className="grid gap-3 lg:grid-cols-4">
            <Input
              name="full_name"
              required
              placeholder="Full name"
              className="h-11"
            />
            <Input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="h-11"
            />
            <Select name="role" defaultValue="staff" className="h-11">
              <option value="admin">admin</option>
              <option value="manager">manager</option>
              <option value="staff">staff</option>
            </Select>
            <Select
              value={createMode}
              onChange={(event) => setCreateMode(event.target.value as ProvisionMode)}
              className="h-11"
            >
              <option value="invite">invite by email</option>
              <option value="password">set temp password</option>
            </Select>
          </div>

          {createMode === "password" ? (
            <Input
              name="password"
              type="password"
              minLength={8}
              required
              placeholder="Temporary password"
              className="h-11 w-full"
            />
          ) : (
            <p className="ims-empty text-xs">
              Invite mode sends an email link to complete password setup.
            </p>
          )}

          <div className="max-h-44 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
            <p className="ims-kicker text-[0.68rem]">Initial location access</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {locations.map((location) => (
                <label key={location.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createLocationIds.includes(location.id)}
                    onChange={() => toggleCreateLocation(location.id)}
                  />
                  {location.code} - {location.name}
                </label>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="h-11 w-full rounded-2xl sm:w-auto"
          >
            Create user
          </Button>
        </form>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="min-h-[24rem]">
          <h2 className="text-lg font-semibold">User Profiles</h2>
          <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {users.map((user) => (
              <form
                key={user.id}
                onSubmit={saveProfile}
                className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3"
              >
                <input type="hidden" name="id" value={user.id} />
                <div className="text-xs text-[var(--text-muted)]">
                  {user.email ?? "No email"} | {new Date(user.created_at).toLocaleString()}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    name="full_name"
                    defaultValue={user.full_name}
                    className="h-10 rounded-xl"
                  />
                  <Select name="role" defaultValue={user.role} className="h-10 rounded-xl">
                    <option value="admin">admin</option>
                    <option value="manager">manager</option>
                    <option value="staff">staff</option>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input name="is_active" type="checkbox" defaultChecked={user.is_active} />
                    Active
                  </label>
                  <Button type="submit" variant="secondary" disabled={saving} className="h-9">
                    Save
                  </Button>
                  {user.is_active ? (
                    <Button
                      type="button"
                      variant="danger"
                      className="h-9"
                      disabled={saving}
                      onClick={() => {
                        if (
                          confirm("Disable this account and revoke all location access?")
                        ) {
                          setUserEnabled(user.id, false);
                        }
                      }}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9"
                      disabled={saving}
                      onClick={() => setUserEnabled(user.id, true)}
                    >
                      Enable
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9"
                    disabled={saving}
                    onClick={() => resendInvite(user.id)}
                  >
                    Resend invite
                  </Button>
                </div>
              </form>
            ))}
            {users.length === 0 ? <p className="ims-empty">No users found.</p> : null}
          </div>
        </Card>

        <Card className="min-h-[24rem]">
          <h2 className="text-lg font-semibold">Location Access</h2>
          <div className="mt-4 space-y-3">
            <Select
              className="h-11 w-full"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.role}) {user.is_active ? "" : "[disabled]"}
                </option>
              ))}
            </Select>

            {selectedUser ? (
              <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
                <p className="text-sm font-medium">
                  Assign locations for {selectedUser.full_name}
                </p>
                <div className="max-h-64 overflow-y-auto">
                  {locations.map((location) => (
                    <label key={location.id} className="flex items-center gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedLocationIds.includes(location.id)}
                        onChange={() => toggleLocation(location.id)}
                        disabled={!selectedUser.is_active}
                      />
                      {location.code} - {location.name}
                    </label>
                  ))}
                </div>
                <Button
                  onClick={saveLocations}
                  disabled={saving || !selectedUser.is_active}
                  className="h-11 rounded-2xl"
                >
                  Save location access
                </Button>
                {!selectedUser.is_active ? (
                  <p className="ims-alert-warn text-xs">
                    Enable this user first before assigning locations.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
