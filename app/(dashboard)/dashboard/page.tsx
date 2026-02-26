"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type DashboardPayload = {
  totalSkus: number;
  lowStockCount: number;
  expiringSoonCount: number;
  transferSummary: Record<string, number>;
  recentTransactions: Array<{
    id: string;
    tx_number: string;
    type: string;
    status: string;
    created_at: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/reports/dashboard", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as DashboardPayload & { error?: string };
        if (!active) return;
        if (!res.ok) {
          setError(json.error ?? "Failed to load dashboard.");
          setLoading(false);
          return;
        }
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError("Failed to load dashboard.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const transferRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.transferSummary);
  }, [data]);

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Operations</p>
        <h1 className="ims-title text-[2.1rem]">Inventory Dashboard</h1>
        <p className="ims-subtitle">Live stock health, transfer flow, and recent activity.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="min-h-32">
          <p className="ims-kicker">Total SKUs</p>
          {loading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold">{data?.totalSkus ?? "-"}</p>
          )}
        </Card>
        <Card className="min-h-32">
          <p className="ims-kicker">Low Stock</p>
          {loading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold text-[var(--status-warn-fg)]">
              {data?.lowStockCount ?? "-"}
            </p>
          )}
        </Card>
        <Card className="min-h-32">
          <p className="ims-kicker">Expiring Soon</p>
          {loading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold text-[var(--status-danger-fg)]">
              {data?.expiringSoonCount ?? "-"}
            </p>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="min-h-64">
          <h2 className="text-lg font-semibold">Transfer Summary</h2>
          <div className="mt-3 grid gap-2">
            {loading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="ims-skeleton h-10"
                  />
                ))
              : transferRows.map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2"
                  >
                    <span className="text-sm">{status}</span>
                    <Badge>{String(count)}</Badge>
                  </div>
                ))}
          </div>
        </Card>

        <Card className="min-h-64">
          <h2 className="text-lg font-semibold">Recent Transactions</h2>
          <div className="mt-3 max-h-[20rem] space-y-2 overflow-y-auto pr-1">
            {loading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="ims-skeleton h-14"
                  />
                ))
              : (data?.recentTransactions ?? []).map((tx) => (
                  <div
                    key={tx.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2"
                  >
                    <p className="text-sm font-semibold">{tx.tx_number}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {tx.type} - {tx.status}
                    </p>
                  </div>
                ))}
            {!loading && data && data.recentTransactions.length === 0 ? (
              <p className="ims-empty">No recent activity.</p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
