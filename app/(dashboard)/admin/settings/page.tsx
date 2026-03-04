"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AuthMe = {
  capabilities?: {
    canManageSystemSettings?: boolean;
  };
};

export default function AdminSettingsPage() {
  const [companyName, setCompanyName] = useState("");
  const [savedCompanyName, setSavedCompanyName] = useState("");
  const [canManageSystemSettings, setCanManageSystemSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [authRes, settingsRes] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }),
      fetch("/api/settings", { cache: "no-store" }),
    ]);

    const authJson = (await authRes.json()) as AuthMe & { error?: string };
    const settingsJson = (await settingsRes.json()) as {
      company_name?: string;
      error?: string;
    };

    if (!authRes.ok) {
      setError(authJson.error ?? "Failed to load permissions.");
      setLoading(false);
      return;
    }

    if (!settingsRes.ok) {
      setError(settingsJson.error ?? "Failed to load settings.");
      setLoading(false);
      return;
    }

    const nextCompanyName = String(settingsJson.company_name ?? "").trim();
    setCanManageSystemSettings(Boolean(authJson.capabilities?.canManageSystemSettings));
    setCompanyName(nextCompanyName);
    setSavedCompanyName(nextCompanyName);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPage().catch(() => {
      setError("Failed to load settings.");
      setLoading(false);
    });
  }, [loadPage]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageSystemSettings) {
      return;
    }

    const normalizedCompanyName = companyName.trim();
    if (normalizedCompanyName.length < 2) {
      setError("Company name must be at least 2 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: normalizedCompanyName }),
    });
    const json = (await response.json()) as { company_name?: string; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to save settings.");
      setSaving(false);
      return;
    }

    const nextName = String(json.company_name ?? normalizedCompanyName);
    setCompanyName(nextName);
    setSavedCompanyName(nextName);
    setMessage("Settings saved.");
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Administration</p>
        <h1 className="ims-title text-[2.1rem]">Settings</h1>
        <p className="ims-subtitle">Manage global system configuration.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      <Card className="min-h-[18rem]">
        <h2 className="text-lg font-semibold">Company Branding</h2>
        {loading ? (
          <p className="ims-empty mt-4">Loading settings...</p>
        ) : (
          <form onSubmit={saveSettings} className="mt-4 max-w-xl space-y-3">
            <label className="block">
              <span className="ims-field-label">Company name</span>
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                disabled={!canManageSystemSettings}
                placeholder="Company name"
                className="h-11"
              />
            </label>

            {savedCompanyName ? (
              <p className="ims-empty">
                Current value: <strong>{savedCompanyName}</strong>
              </p>
            ) : null}

            {canManageSystemSettings ? (
              <Button type="submit" disabled={saving} className="h-11 rounded-2xl">
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            ) : (
              <p className="ims-alert-warn">restricted: admin only</p>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
