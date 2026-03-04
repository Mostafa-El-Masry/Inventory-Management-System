"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fetchJson } from "@/lib/utils/fetch-json";

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
type UserRole = UserRow["role"];

type UserCreateConfig = {
  role: UserRole;
  mode: ProvisionMode;
  password: string;
  location_ids: string[];
};

const DEFAULT_USER_CREATE_CONFIG: UserCreateConfig = {
  role: "staff",
  mode: "invite",
  password: "",
  location_ids: [],
};

export default function UsersAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedConfig, setAdvancedConfig] = useState<UserCreateConfig>(
    DEFAULT_USER_CREATE_CONFIG,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchJson<{ items?: UserRow[]; error?: string }>("/api/admin/users", {
      cache: "no-store",
      signal,
      fallbackError: "Only admins can access this page.",
    });
    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setUsers(result.data.items ?? []);
    const firstUserId = (result.data.items ?? [])[0]?.id ?? "";
    if (firstUserId) {
      setSelectedUserId((current) => current || firstUserId);
    }
  }, []);

  const loadLocations = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchJson<{ items?: LocationRow[]; error?: string }>("/api/locations", {
      signal,
      fallbackError: "Failed to load locations.",
    });
    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setLocations(result.data.items ?? []);
  }, []);

  const loadUserLocations = useCallback(async (userId: string, signal?: AbortSignal) => {
    const result = await fetchJson<{
      items?: Array<{ location_id: string }>;
      error?: string;
    }>(`/api/admin/users/${userId}/locations`, {
      cache: "no-store",
      signal,
      fallbackError: "Failed to load user locations.",
    });

    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setSelectedLocationIds((result.data.items ?? []).map((row) => row.location_id));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([loadUsers(controller.signal), loadLocations(controller.signal)]).catch(() =>
      setError("Failed to load users."),
    );
    return () => controller.abort();
  }, [loadUsers, loadLocations]);

  useEffect(() => {
    if (selectedUserId) {
      const controller = new AbortController();
      loadUserLocations(selectedUserId, controller.signal).catch(() =>
        setError("Failed to load user locations."),
      );
      return () => controller.abort();
    }
  }, [selectedUserId, loadUserLocations]);

  const canSubmitBase =
    newUser.full_name.trim().length > 0 && newUser.email.trim().length > 0;
  const canSubmitAdvanced =
    canSubmitBase &&
    (advancedConfig.mode === "invite" || advancedConfig.password.length >= 12);

  async function createUserWithConfig(config: UserCreateConfig) {
    if (!canSubmitBase) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        email: newUser.email.trim(),
        full_name: newUser.full_name.trim(),
        role: config.role,
        mode: config.mode,
        password: config.mode === "password" ? config.password : undefined,
        location_ids: config.location_ids,
      };

      const result = await fetchJson<{ id?: string; error?: string }>("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackError: "Failed to create user.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNewUser({
        full_name: "",
        email: "",
      });
      setAdvancedConfig(DEFAULT_USER_CREATE_CONFIG);
      setAdvancedOpen(false);

      await loadUsers();
      if (result.data.id) {
        setSelectedUserId(result.data.id);
        await loadUserLocations(result.data.id);
      }
    } finally {
      setSaving(false);
    }
  }

  async function createUserNow() {
    await createUserWithConfig(DEFAULT_USER_CREATE_CONFIG);
  }

  async function createUserAdvanced() {
    await createUserWithConfig(advancedConfig);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const payload = {
        id: String(formData.get("id") ?? ""),
        full_name: String(formData.get("full_name") ?? ""),
        role: String(formData.get("role") ?? "staff"),
        is_active: formData.get("is_active") === "on",
      };

      const result = await fetchJson<{ error?: string }>("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackError: "Failed to save user.",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await loadUsers();
    } finally {
      setSaving(false);
    }
  }

  async function setUserEnabled(userId: string, enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const endpoint = enabled ? "enable" : "disable";
      const result = await fetchJson<{ error?: string }>(
        `/api/admin/users/${userId}/${endpoint}`,
        {
          method: "POST",
          fallbackError: `Failed to ${endpoint} user.`,
        },
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await loadUsers();
      if (selectedUserId) {
        await loadUserLocations(selectedUserId);
      }
    } finally {
      setSaving(false);
    }
  }

  async function resendInvite(userId: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/admin/users/${userId}/invite-resend`,
        {
          method: "POST",
          fallbackError: "Failed to send invite/reset email.",
        },
      );

      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveLocations() {
    if (!selectedUserId) return;

    setSaving(true);
    setError(null);
    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/admin/users/${selectedUserId}/locations`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location_ids: selectedLocationIds }),
          fallbackError: "Failed to save location access.",
        },
      );

      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleLocation(locationId: string) {
    setSelectedLocationIds((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
  }

  function toggleAdvancedLocation(locationId: string) {
    setAdvancedConfig((current) => ({
      ...current,
      location_ids: current.location_ids.includes(locationId)
        ? current.location_ids.filter((id) => id !== locationId)
        : [...current.location_ids, locationId],
    }));
  }

  function openAdvancedDrawer() {
    setAdvancedConfig(DEFAULT_USER_CREATE_CONFIG);
    setAdvancedOpen(true);
  }

  function closeAdvancedDrawer() {
    if (!saving) {
      setAdvancedOpen(false);
    }
  }

  function setAdvancedMode(mode: ProvisionMode) {
    setAdvancedConfig((current) => ({
      ...current,
      mode,
      password: mode === "password" ? current.password : "",
    }));
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

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="min-h-[24rem]">
          <h2 className="text-lg font-semibold">User Profiles</h2>

          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
            <p className="ims-kicker text-[0.68rem]">Quick Create</p>
            <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto]">
              <Input
                value={newUser.full_name}
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, full_name: event.target.value }))
                }
                placeholder="Full name"
                className="h-10 rounded-xl"
              />
              <Input
                type="email"
                value={newUser.email}
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="Email"
                className="h-10 rounded-xl"
              />
              <Button
                type="button"
                className="h-10 rounded-xl"
                disabled={saving || !canSubmitBase}
                onClick={createUserNow}
              >
                {saving ? "Creating..." : "Create now"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-10 rounded-xl"
                disabled={saving}
                onClick={openAdvancedDrawer}
              >
                Advanced
              </Button>
            </div>
            <p className="ims-empty mt-2 text-xs">
              Create now uses invite mode, staff role, and no location access.
            </p>
          </div>

          <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {users.map((user) => (
              <form
                key={user.id}
                onSubmit={saveProfile}
                className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3"
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
              <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
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

      {advancedOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close advanced panel"
            className="absolute inset-0 bg-black/40"
            onClick={closeAdvancedDrawer}
          />
          <aside
            aria-label="Create user advanced options"
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Advanced Create User</h2>
                <p className="ims-subtitle text-sm">
                  Adjust role, mode, password, and initial location access before creating.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-10 rounded-xl"
                disabled={saving}
                onClick={closeAdvancedDrawer}
              >
                Close
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              <Select
                value={advancedConfig.role}
                onChange={(event) => setAdvancedConfig((current) => ({
                  ...current,
                  role: event.target.value as UserRole,
                }))}
                className="h-11"
              >
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="staff">staff</option>
              </Select>

              <Select
                value={advancedConfig.mode}
                onChange={(event) => setAdvancedMode(event.target.value as ProvisionMode)}
                className="h-11"
              >
                <option value="invite">invite by email</option>
                <option value="password">set temp password</option>
              </Select>

              {advancedConfig.mode === "password" ? (
                <Input
                  type="password"
                  value={advancedConfig.password}
                  onChange={(event) => setAdvancedConfig((current) => ({
                    ...current,
                    password: event.target.value,
                  }))}
                  minLength={12}
                  placeholder="Temporary password"
                  className="h-11 w-full"
                />
              ) : null}

              <p className="ims-empty text-xs">
                {advancedConfig.mode === "password"
                  ? "Password mode requires 12+ chars with uppercase, lowercase, number, and symbol."
                  : "Invite mode sends an email link to complete password setup."}
              </p>

              <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <p className="ims-kicker text-[0.68rem]">Initial location access</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {locations.map((location) => (
                    <label key={location.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={advancedConfig.location_ids.includes(location.id)}
                        onChange={() => toggleAdvancedLocation(location.id)}
                      />
                      {location.code} - {location.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-10 rounded-xl"
                disabled={saving}
                onClick={() => {
                  setAdvancedConfig(DEFAULT_USER_CREATE_CONFIG);
                  closeAdvancedDrawer();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl"
                disabled={saving || !canSubmitAdvanced}
                onClick={createUserAdvanced}
              >
                {saving ? "Creating..." : "Create user"}
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

