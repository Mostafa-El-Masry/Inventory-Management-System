"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchJson } from "@/lib/utils/fetch-json";

type AlertItem = {
  id: string;
  type: string;
  severity: string;
  status: string;
  message: string;
  due_date: string | null;
  products?: { name: string; sku: string } | null;
  locations?: { name: string; code: string } | null;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acking, setAcking] = useState<string | null>(null);

  async function loadAlerts(signal?: AbortSignal) {
    setLoading(true);
    try {
      const result = await fetchJson<{ items?: AlertItem[]; error?: string }>(
        "/api/alerts?limit=200",
        {
          cache: "no-store",
          signal,
          fallbackError: "Failed to load alerts.",
        },
      );
      if (!result.ok) {
        if (result.error !== "Request aborted.") {
          setError(result.error);
        }
        return;
      }

      setError(null);
      setAlerts(result.data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadAlerts(controller.signal).catch(() => setError("Failed to load alerts."));
    return () => controller.abort();
  }, []);

  async function ackAlert(id: string) {
    setAcking(id);
    try {
      const result = await fetchJson<{ error?: string }>(`/api/alerts/${id}/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Acknowledged from dashboard UI." }),
        fallbackError: "Failed to acknowledge alert.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      await loadAlerts();
    } finally {
      setAcking(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Operations</p>
        <h1 className="ims-title text-[2.1rem]">Alerts</h1>
        <p className="ims-subtitle">Low stock and expiry warnings with acknowledgment workflow.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-[24rem]">
        <h2 className="text-lg font-semibold">Open and Historical Alerts</h2>
        {loading ? <p className="ims-empty mt-2">Loading alerts...</p> : null}
        <div className="mt-4 max-h-[36rem] space-y-3 overflow-y-auto pr-1">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-muted)] p-[var(--space-4)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={alert.severity === "CRITICAL" ? "danger" : "warn"}>
                  {alert.severity}
                </Badge>
                <Badge>{alert.type}</Badge>
                <Badge tone={alert.status === "ACKED" ? "success" : "default"}>
                  {alert.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-medium">{alert.message}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {(alert.locations?.code ?? "LOC")} - {(alert.products?.sku ?? "SKU")} -{" "}
                {alert.due_date ?? "No due date"}
              </p>

              {alert.status !== "ACKED" ? (
                <Button
                  variant="secondary"
                  className="mt-3 h-10 rounded-xl"
                  disabled={acking === alert.id}
                  onClick={() => ackAlert(alert.id)}
                >
                  {acking === alert.id ? "Acknowledging..." : "Acknowledge"}
                </Button>
              ) : null}
            </div>
          ))}
          {alerts.length === 0 ? (
            <p className="ims-empty">No alerts available.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
