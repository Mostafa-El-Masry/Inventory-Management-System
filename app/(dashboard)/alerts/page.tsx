"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

  async function loadAlerts() {
    const response = await fetch("/api/alerts?limit=200", { cache: "no-store" });
    const json = (await response.json()) as { items?: AlertItem[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load alerts.");
      return;
    }
    setAlerts(json.items ?? []);
  }

  useEffect(() => {
    loadAlerts().catch(() => setError("Failed to load alerts."));
  }, []);

  async function ackAlert(id: string) {
    const response = await fetch(`/api/alerts/${id}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Acknowledged from dashboard UI." }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to acknowledge alert.");
      return;
    }
    await loadAlerts();
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
                  onClick={() => ackAlert(alert.id)}
                >
                  Acknowledge
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
