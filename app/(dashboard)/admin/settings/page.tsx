"use client";

import { FormEvent, useEffect, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/utils/fetch-json";

export default function AdminSettingsPage() {
  const { capabilities, companyName: initialCompanyName } = useDashboardSession();
  const [companyName, setCompanyName] = useState("");
  const [savedCompanyName, setSavedCompanyName] = useState("");
  const [canManageSystemSettings, setCanManageSystemSettings] = useState(
    capabilities.canManageSystemSettings,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextCompanyName = initialCompanyName.trim();
    setCanManageSystemSettings(capabilities.canManageSystemSettings);
    setCompanyName(nextCompanyName);
    setSavedCompanyName(nextCompanyName);
    setLoading(false);
  }, [capabilities.canManageSystemSettings, initialCompanyName]);

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

    try {
      const result = await fetchJson<{ company_name?: string; error?: string }>(
        "/api/settings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: normalizedCompanyName }),
          fallbackError: "Failed to save settings.",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const nextName = String(result.data.company_name ?? normalizedCompanyName);
      setCompanyName(nextName);
      setSavedCompanyName(nextName);
      setMessage("Settings saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Administration</p>
        <h1 className="ims-title">Settings</h1>
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
                className="ims-control-lg"
              />
            </label>

            {savedCompanyName ? (
              <p className="ims-empty">
                Current value: <strong>{savedCompanyName}</strong>
              </p>
            ) : null}

            {canManageSystemSettings ? (
              <Button type="submit" disabled={saving} className="ims-control-lg rounded-2xl">
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
