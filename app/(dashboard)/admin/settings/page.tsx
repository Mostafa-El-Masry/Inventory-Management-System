"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  SettingsPreviewLookup,
  SettingsPreviewProduct,
  SettingsTestActionResponse,
  SettingsTestDefaultsResponse,
} from "@/lib/types/api";
import { fetchJson } from "@/lib/utils/fetch-json";

type SettingsTab = "branding" | "test";

type TestCardState = {
  loading: boolean;
  error: string | null;
  result: SettingsTestActionResponse | null;
};

const INITIAL_TEST_CARD_STATE: TestCardState = {
  loading: false,
  error: null,
  result: null,
};

function formatLookupLabel(item: SettingsPreviewLookup | null) {
  return item ? `${item.code} - ${item.name}` : "--";
}

function formatProductLabel(product: SettingsPreviewProduct | null) {
  return product ? `${product.sku} - ${product.name}` : "--";
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      className="ims-control-md rounded-full px-4"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function PreviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
      <p className="ims-field-label">{label}</p>
      <p className="mt-2 text-sm text-[var(--text-strong)]">{value}</p>
    </div>
  );
}

function TestStatusNotice({
  state,
  label,
}: {
  state: TestCardState;
  label: string;
}) {
  if (state.error) {
    return <p className="ims-alert-danger mt-4">{state.error}</p>;
  }

  if (!state.result) {
    return null;
  }

  const recordNumber = state.result.record.number || state.result.record.id;
  const recordStatus = state.result.record.status || "--";
  const steps = state.result.steps_completed.join(" -> ");
  const bootstrapNumber =
    state.result.bootstrap_record?.number || state.result.bootstrap_record?.id || null;

  if (state.result.success) {
    return (
      <div className="mt-4 space-y-2">
        <p className="ims-alert-success">
          {label} completed. {recordNumber} is {recordStatus}.
        </p>
        {bootstrapNumber ? (
          <p className="ims-empty">Bootstrap record: {bootstrapNumber}</p>
        ) : null}
        <p className="ims-empty">Completed steps: {steps}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="ims-alert-warn">
        {label} partially completed. {recordNumber} is {recordStatus}. Failed at{" "}
        {state.result.failed_step ?? "unknown step"}: {state.result.error ?? "Unknown error."}
      </p>
      {bootstrapNumber ? (
        <p className="ims-empty">Bootstrap record: {bootstrapNumber}</p>
      ) : null}
      <p className="ims-empty">Completed steps: {steps}</p>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { capabilities, companyName: initialCompanyName } = useDashboardSession();
  const [activeTab, setActiveTab] = useState<SettingsTab>("branding");
  const [companyName, setCompanyName] = useState("");
  const [savedCompanyName, setSavedCompanyName] = useState("");
  const [canManageSystemSettings, setCanManageSystemSettings] = useState(
    capabilities.canManageSystemSettings,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testDefaultsLoading, setTestDefaultsLoading] = useState(false);
  const [testDefaultsError, setTestDefaultsError] = useState<string | null>(null);
  const [testDefaults, setTestDefaults] = useState<SettingsTestDefaultsResponse | null>(null);
  const [purchaseState, setPurchaseState] = useState<TestCardState>(INITIAL_TEST_CARD_STATE);
  const [transferState, setTransferState] = useState<TestCardState>(INITIAL_TEST_CARD_STATE);
  const [consumptionState, setConsumptionState] = useState<TestCardState>(
    INITIAL_TEST_CARD_STATE,
  );
  const hasRequestedTestDefaults = useRef(false);

  useEffect(() => {
    const nextCompanyName = initialCompanyName.trim();
    setCanManageSystemSettings(capabilities.canManageSystemSettings);
    setCompanyName(nextCompanyName);
    setSavedCompanyName(nextCompanyName);
    setLoading(false);
  }, [capabilities.canManageSystemSettings, initialCompanyName]);

  useEffect(() => {
    if (!canManageSystemSettings && activeTab === "test") {
      setActiveTab("branding");
    }
  }, [activeTab, canManageSystemSettings]);

  useEffect(() => {
    if (!canManageSystemSettings || hasRequestedTestDefaults.current) {
      return;
    }

    hasRequestedTestDefaults.current = true;
    let cancelled = false;
    setTestDefaultsLoading(true);
    setTestDefaultsError(null);

    fetchJson<SettingsTestDefaultsResponse>("/api/settings/test-defaults", {
      cache: "no-store",
      fallbackError: "Failed to load test defaults.",
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setTestDefaultsError(result.error);
          return;
        }

        setTestDefaults(result.data);
      })
      .finally(() => {
        if (!cancelled) {
          setTestDefaultsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canManageSystemSettings]);

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

  async function runTestAction(
    kind: SettingsTestActionResponse["kind"],
    setState: (value: TestCardState) => void,
    fallbackError: string,
  ) {
    setState({ loading: true, error: null, result: null });

    const result = await fetchJson<SettingsTestActionResponse>("/api/settings/test-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      fallbackError,
    });

    if (!result.ok) {
      setState({
        loading: false,
        error: result.error,
        result: null,
      });
      return false;
    }

    setState({
      loading: false,
      error: null,
      result: result.data,
    });

    return result.data.success;
  }

  async function handlePurchaseRun() {
    await runTestAction("purchase", setPurchaseState, "Failed to run purchase test.");
  }

  async function handleTransferRun() {
    await runTestAction("transfer", setTransferState, "Failed to run transfer test.");
  }

  async function handleConsumptionRun() {
    await runTestAction(
      "consumption",
      setConsumptionState,
      "Failed to run consumption test.",
    );
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

      <div className="flex flex-wrap gap-2">
        <TabButton active={activeTab === "branding"} onClick={() => setActiveTab("branding")}>
          Branding
        </TabButton>
        {canManageSystemSettings ? (
          <TabButton active={activeTab === "test"} onClick={() => setActiveTab("test")}>
            Test
          </TabButton>
        ) : null}
      </div>

      {activeTab === "branding" ? (
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
      ) : null}

      {activeTab === "test" && canManageSystemSettings ? (
        <div className="space-y-6">
          <Card className="min-h-[12rem]">
            <h2 className="text-lg font-semibold">Test Transactions</h2>
            <p className="ims-subtitle mt-2">
              Run real purchase, transfer, and consumption smoke tests with server-selected data.
              Auto-generated smoke-test records are tagged with{" "}
              <strong>[TEST][AUTO]</strong>.
            </p>
            {testDefaultsLoading ? (
              <p className="ims-empty mt-4">Loading test defaults...</p>
            ) : null}
            {testDefaultsError ? (
              <div className="mt-4 space-y-2">
                <p className="ims-alert-danger mb-0">{testDefaultsError}</p>
                <p className="ims-empty">Defaults load once per page session. Refresh to try again.</p>
              </div>
            ) : null}
          </Card>

          <Card className="min-h-[18rem]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Purchase Test</h2>
                <p className="ims-subtitle">
                  Creates a real posted receipt with randomized active supplier, branch, product,
                  quantity, and unit cost on every run.
                </p>
              </div>

              <Button
                type="button"
                onClick={handlePurchaseRun}
                disabled={purchaseState.loading}
                className="ims-control-lg rounded-2xl"
              >
                {purchaseState.loading ? "Running..." : "Run Purchase Test"}
              </Button>
            </div>
            <TestStatusNotice state={purchaseState} label="Purchase test" />
          </Card>

          <Card className="min-h-[16rem]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Transfer Test</h2>
                <p className="ims-subtitle">
                  Uses the first two active branches as source and destination. If the source has
                  no stock, the system bootstraps the minimum purchase first, then completes the
                  full approve, dispatch, and receive flow.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleTransferRun}
                disabled={testDefaultsLoading || !testDefaults || transferState.loading}
                className="ims-control-lg rounded-2xl"
              >
                {transferState.loading ? "Running..." : "Run Transfer Test"}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <PreviewItem
                label="Source"
                value={formatLookupLabel(testDefaults?.transfer.source_location ?? null)}
              />
              <PreviewItem
                label="Destination"
                value={formatLookupLabel(testDefaults?.transfer.destination_location ?? null)}
              />
              <PreviewItem
                label="Product"
                value={formatProductLabel(testDefaults?.transfer.product ?? null)}
              />
              <PreviewItem
                label="Quantity"
                value={String(testDefaults?.transfer.qty ?? 0)}
              />
              <PreviewItem
                label="Bootstrap"
                value={
                  testDefaults?.transfer.bootstrap_required
                    ? "Creates source stock automatically"
                    : "Uses existing source stock"
                }
              />
            </div>
            <TestStatusNotice state={transferState} label="Transfer test" />
          </Card>

          <Card className="min-h-[16rem]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Consumption Test (COGS)</h2>
                <p className="ims-subtitle">
                  Uses the first stocked branch and product when available. If the environment is
                  empty, the system bootstraps the minimum purchase first and then posts a real
                  consumption transaction.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleConsumptionRun}
                disabled={testDefaultsLoading || !testDefaults || consumptionState.loading}
                className="ims-control-lg rounded-2xl"
              >
                {consumptionState.loading ? "Running..." : "Run Consumption Test"}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <PreviewItem
                label="Source"
                value={formatLookupLabel(testDefaults?.consumption.location ?? null)}
              />
              <PreviewItem
                label="Product"
                value={formatProductLabel(testDefaults?.consumption.product ?? null)}
              />
              <PreviewItem
                label="Quantity"
                value={String(testDefaults?.consumption.qty ?? 0)}
              />
              <PreviewItem
                label="Bootstrap"
                value={
                  testDefaults?.consumption.bootstrap_required
                    ? "Creates source stock automatically"
                    : "Uses existing stock"
                }
              />
            </div>
            <TestStatusNotice state={consumptionState} label="Consumption test" />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
