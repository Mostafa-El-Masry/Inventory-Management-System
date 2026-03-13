"use client";

import { FormEvent, useEffect, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CLEAR_TRANSACTIONS_CONFIRMATION,
  CLEAR_TRANSACTIONS_COUNT_KEYS,
} from "@/lib/settings/clear-transactions";
import type {
  SettingsClearTransactionsResponse,
  SettingsTestActionResponse,
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

const CLEAR_TRANSACTIONS_COUNT_LABELS = {
  supplier_document_payments: "Supplier Payments",
  supplier_documents: "Supplier Documents",
  stock_ledger: "Stock Ledger",
  inventory_transaction_lines: "Transaction Lines",
  transfer_lines: "Transfer Lines",
  transfers: "Transfers",
  inventory_transactions: "Transactions",
  inventory_batches: "Inventory Batches",
  alerts: "Alerts",
} as const;

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

function TestActionSection({
  title,
  buttonLabel,
  loadingLabel,
  state,
  noticeLabel,
  onRun,
}: {
  title: string;
  buttonLabel: string;
  loadingLabel: string;
  state: TestCardState;
  noticeLabel: string;
  onRun: () => void;
}) {
  return (
    <section className="w-full max-w-4xl py-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="ims-kicker text-[0.66rem]">Smoke Test</p>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
            {title}
          </h2>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onRun}
          disabled={state.loading}
          className="ims-control-md rounded-full px-5 shadow-none"
        >
          {state.loading ? loadingLabel : buttonLabel}
        </Button>
      </div>

      <TestStatusNotice state={state} label={noticeLabel} />
    </section>
  );
}

export default function AdminSettingsPage({
  initialTab = "branding",
}: {
  initialTab?: SettingsTab;
} = {}) {
  const { capabilities, companyName: initialCompanyName } = useDashboardSession();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [companyName, setCompanyName] = useState("");
  const [savedCompanyName, setSavedCompanyName] = useState("");
  const [canManageSystemSettings, setCanManageSystemSettings] = useState(
    capabilities.canManageSystemSettings,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [purchaseState, setPurchaseState] = useState<TestCardState>(INITIAL_TEST_CARD_STATE);
  const [transferState, setTransferState] = useState<TestCardState>(INITIAL_TEST_CARD_STATE);
  const [consumptionState, setConsumptionState] = useState<TestCardState>(
    INITIAL_TEST_CARD_STATE,
  );
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [clearLoading, setClearLoading] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<SettingsClearTransactionsResponse | null>(null);

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

  async function handleClearTransactions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canManageSystemSettings ||
      clearLoading ||
      clearConfirmation !== CLEAR_TRANSACTIONS_CONFIRMATION
    ) {
      return;
    }

    setClearLoading(true);
    setClearError(null);
    setClearResult(null);

    try {
      const result = await fetchJson<SettingsClearTransactionsResponse>(
        "/api/settings/clear-transactions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: clearConfirmation,
          }),
          fallbackError: "Failed to clear transaction data.",
        },
      );

      if (!result.ok) {
        setClearError(result.error);
        return;
      }

      setClearConfirmation("");
      setClearResult(result.data);
      setPurchaseState(INITIAL_TEST_CARD_STATE);
      setTransferState(INITIAL_TEST_CARD_STATE);
      setConsumptionState(INITIAL_TEST_CARD_STATE);
    } finally {
      setClearLoading(false);
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
          <TestActionSection
            title="Purchase Test"
            buttonLabel="Run Purchase Test"
            loadingLabel="Running..."
            state={purchaseState}
            noticeLabel="Purchase test"
            onRun={handlePurchaseRun}
          />

          <TestActionSection
            title="Transfer Test"
            buttonLabel="Run Transfer Test"
            loadingLabel="Running..."
            state={transferState}
            noticeLabel="Transfer test"
            onRun={handleTransferRun}
          />

          <TestActionSection
            title="Consumption Test (COGS)"
            buttonLabel="Run Consumption Test"
            loadingLabel="Running..."
            state={consumptionState}
            noticeLabel="Consumption test"
            onRun={handleConsumptionRun}
          />

          <Card className="min-h-[18rem]">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="ims-kicker">Danger Zone</p>
                <h2 className="text-lg font-semibold">Clear Transaction Data</h2>
                <p className="ims-subtitle">
                  This permanently removes transaction history, transfers, stock batches, stock
                  ledger, transaction-backed supplier documents and payments, and alerts from
                  Supabase. Products, suppliers, locations, taxonomy, users, and system settings
                  remain unchanged.
                </p>
              </div>

              <p className="ims-alert-warn">
                Type <strong>{CLEAR_TRANSACTIONS_CONFIRMATION}</strong> exactly to enable the
                delete action.
              </p>

              <form onSubmit={handleClearTransactions} className="space-y-4">
                <label className="block max-w-xl">
                  <span className="ims-field-label">Confirmation phrase</span>
                  <Input
                    value={clearConfirmation}
                    onChange={(event) => {
                      setClearConfirmation(event.target.value);
                      if (clearError) {
                        setClearError(null);
                      }
                    }}
                    placeholder={CLEAR_TRANSACTIONS_CONFIRMATION}
                    className="ims-control-lg"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>

                <Button
                  type="submit"
                  variant="danger"
                  disabled={
                    clearLoading ||
                    clearConfirmation !== CLEAR_TRANSACTIONS_CONFIRMATION
                  }
                  className="ims-control-lg rounded-2xl"
                >
                  {clearLoading ? "Clearing..." : "Clear Transaction Data"}
                </Button>
              </form>

              {clearError ? <p className="ims-alert-danger">{clearError}</p> : null}

              {clearResult ? (
                <div className="space-y-4">
                  <p className="ims-alert-success">
                    Transaction data cleared. {clearResult.total_rows_cleared} rows removed.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {CLEAR_TRANSACTIONS_COUNT_KEYS.map((key) => (
                      <PreviewItem
                        key={key}
                        label={CLEAR_TRANSACTIONS_COUNT_LABELS[key]}
                        value={String(clearResult.counts[key])}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
