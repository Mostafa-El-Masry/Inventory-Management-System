"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Metrics = {
  totalSkus: number;
  lowStockCount: number;
  expiringSoonCount: number;
};

export default function ReportsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports/dashboard", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as Metrics & { error?: string };
        if (!res.ok) {
          setError(json.error ?? "Failed to load report metrics.");
          setLoading(false);
          return;
        }
        setMetrics(json);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load report metrics.");
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Analytics</p>
        <h1 className="ims-title text-[2.1rem]">Reports</h1>
        <p className="ims-subtitle">Download CSV exports and monitor high-level KPIs.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="min-h-32">
          <p className="ims-kicker">Total SKUs</p>
          {loading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold">{metrics?.totalSkus ?? "-"}</p>
          )}
        </Card>
        <Card className="min-h-32">
          <p className="ims-kicker">Low Stock</p>
          {loading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold">{metrics?.lowStockCount ?? "-"}</p>
          )}
        </Card>
        <Card className="min-h-32">
          <p className="ims-kicker">Expiring Soon</p>
          {loading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold">{metrics?.expiringSoonCount ?? "-"}</p>
          )}
        </Card>
      </section>

      <Card className="min-h-36">
        <h2 className="text-lg font-semibold">CSV Exports</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/api/reports/export?entity=products">
            <Button className="h-11 rounded-2xl">Export Products</Button>
          </a>
          <a href="/api/reports/export?entity=stock">
            <Button variant="outline" className="h-11 rounded-2xl">
              Export Stock
            </Button>
          </a>
          <a href="/api/reports/export?entity=transactions">
            <Button variant="outline" className="h-11 rounded-2xl">
              Export Transactions
            </Button>
          </a>
        </div>
      </Card>
    </div>
  );
}
