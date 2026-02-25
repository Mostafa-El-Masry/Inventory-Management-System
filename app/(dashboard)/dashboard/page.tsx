"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  useEffect(() => {
    let active = true;
    fetch("/api/reports/dashboard", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as DashboardPayload & { error?: string };
        if (!active) return;
        if (!res.ok) {
          setError(json.error ?? "Failed to load dashboard.");
          return;
        }
        setData(json);
      })
      .catch(() => {
        if (active) setError("Failed to load dashboard.");
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
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-700">
          Operations
        </p>
        <h1 className="text-2xl font-bold">Inventory Dashboard</h1>
        <p className="text-sm text-slate-600">
          Live stock health, transfer flow, and recent activity.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wider text-slate-500">Total SKUs</p>
          <p className="mt-2 text-3xl font-bold">{data?.totalSkus ?? "-"}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-slate-500">Low Stock</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {data?.lowStockCount ?? "-"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Expiring Soon
          </p>
          <p className="mt-2 text-3xl font-bold text-rose-700">
            {data?.expiringSoonCount ?? "-"}
          </p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Transfer Summary</h2>
          <div className="mt-3 grid gap-2">
            {transferRows.map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2"
              >
                <span className="text-sm">{status}</span>
                <Badge>{String(count)}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Recent Transactions</h2>
          <div className="mt-3 space-y-2">
            {(data?.recentTransactions ?? []).map((tx) => (
              <div
                key={tx.id}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <p className="text-sm font-semibold">{tx.tx_number}</p>
                <p className="text-xs text-slate-600">
                  {tx.type} · {tx.status}
                </p>
              </div>
            ))}
            {data && data.recentTransactions.length === 0 ? (
              <p className="text-sm text-slate-500">No recent activity.</p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
