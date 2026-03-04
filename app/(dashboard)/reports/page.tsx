
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fetchJson } from "@/lib/utils/fetch-json";

type Metrics = {
  totalSkus: number;
  lowStockCount: number;
  expiringSoonCount: number;
};

type Lookup = {
  id: string;
  code?: string;
  sku?: string;
  name: string;
};

type StockSummaryTotalRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  qty_on_hand: number;
  stock_value: number;
};

type StockSummaryDetailRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  qty_on_hand: number;
  stock_value: number;
};

type ItemStatementRow = {
  occurred_at: string;
  tx_number: string | null;
  transaction_type: string | null;
  transaction_status: string | null;
  location_id: string;
  location_code: string;
  location_name: string;
  direction: "IN" | "OUT";
  qty: number;
  signed_qty: number;
  running_qty: number;
  unit_cost: number;
  reason_code: string | null;
};

type ItemCostEvolutionRow = {
  occurred_at: string;
  tx_number: string | null;
  transaction_type: string | null;
  location_id: string;
  location_code: string;
  location_name: string;
  qty_in: number;
  unit_cost: number;
  line_value: number;
  cost_source: "line_unit_cost" | "batch_unit_cost" | "fallback_zero";
  lot_number: string | null;
  expiry_date: string | null;
};

type SupplierRow = {
  id: string;
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  document_no: string;
  document_type: "INVOICE" | "CREDIT_NOTE";
  document_date: string;
  location_id: string;
  location_code: string;
  location_name: string;
  transaction_id: string | null;
  transaction_number: string | null;
  gross_amount: number;
  paid_amount: number;
  pending_amount: number;
  status: "OPEN" | "VOID";
  can_record_payment: boolean;
};

type SupplierSummary = {
  total_invoiced: number;
  total_credits: number;
  total_paid: number;
  net_pending: number;
};

type ReportTab = "stock-summary" | "item-statement" | "item-cost-evolution" | "supplier";

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month, now.getUTCDate()));
  return {
    fromDate: start.toISOString().slice(0, 10),
    toDate: end.toISOString().slice(0, 10),
    today: end.toISOString().slice(0, 10),
  };
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

function exportHref(entity: string, params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  search.set("entity", entity);
  for (const [key, value] of Object.entries(params)) {
    if (!value) {
      continue;
    }
    search.set(key, value);
  }
  return `/api/reports/export?${search.toString()}`;
}

const monthDefaults = getCurrentMonthRange();

export default function ReportsPage() {
  const { companyName } = useDashboardSession();
  const [activeTab, setActiveTab] = useState<ReportTab>("stock-summary");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [suppliers, setSuppliers] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [stockAsOfDate, setStockAsOfDate] = useState(monthDefaults.today);
  const [stockLocationId, setStockLocationId] = useState("");
  const [stockView, setStockView] = useState<"totals" | "details">("totals");
  const [stockTotals, setStockTotals] = useState<StockSummaryTotalRow[]>([]);
  const [stockDetails, setStockDetails] = useState<StockSummaryDetailRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  const [statementProductId, setStatementProductId] = useState("");
  const [statementFromDate, setStatementFromDate] = useState(monthDefaults.fromDate);
  const [statementToDate, setStatementToDate] = useState(monthDefaults.toDate);
  const [statementLocationId, setStatementLocationId] = useState("");
  const [statementOpeningQty, setStatementOpeningQty] = useState(0);
  const [statementRows, setStatementRows] = useState<ItemStatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  const [costProductId, setCostProductId] = useState("");
  const [costFromDate, setCostFromDate] = useState(monthDefaults.fromDate);
  const [costToDate, setCostToDate] = useState(monthDefaults.toDate);
  const [costLocationId, setCostLocationId] = useState("");
  const [costRows, setCostRows] = useState<ItemCostEvolutionRow[]>([]);
  const [costSummary, setCostSummary] = useState({
    min_unit_cost: 0,
    max_unit_cost: 0,
    avg_unit_cost: 0,
    total_qty_in: 0,
    total_value: 0,
  });
  const [costLoading, setCostLoading] = useState(false);

  const [supplierFromDate, setSupplierFromDate] = useState(monthDefaults.fromDate);
  const [supplierToDate, setSupplierToDate] = useState(monthDefaults.toDate);
  const [supplierFilterId, setSupplierFilterId] = useState("");
  const [supplierStatusFilter, setSupplierStatusFilter] = useState<"" | "OPEN" | "VOID">("");
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<SupplierSummary>({
    total_invoiced: 0,
    total_credits: 0,
    total_paid: 0,
    net_pending: 0,
  });
  const [supplierLoading, setSupplierLoading] = useState(false);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<SupplierRow | null>(null);
  const [paymentDate, setPaymentDate] = useState(monthDefaults.today);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const loadMetrics = useCallback(async (signal?: AbortSignal) => {
    setMetricsLoading(true);
    try {
      const result = await fetchJson<Metrics & { error?: string }>("/api/reports/dashboard", {
        cache: "no-store",
        signal,
        fallbackError: "Failed to load report metrics.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMetrics(result.data);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadLookups = useCallback(async (signal?: AbortSignal) => {
    setLookupsLoading(true);
    try {
      const [productsResult, locationsResult, suppliersResult] = await Promise.all([
        fetchJson<{ items?: Lookup[]; error?: string }>("/api/products", {
          signal,
          fallbackError: "Failed to load products.",
        }),
        fetchJson<{ items?: Lookup[]; error?: string }>("/api/locations", {
          signal,
          fallbackError: "Failed to load locations.",
        }),
        fetchJson<{ items?: Lookup[]; error?: string }>("/api/suppliers", {
          signal,
          fallbackError: "Failed to load suppliers.",
        }),
      ]);

      if (!productsResult.ok) {
        setError(productsResult.error);
        return;
      }
      if (!locationsResult.ok) {
        setError(locationsResult.error);
        return;
      }
      if (!suppliersResult.ok) {
        setError(suppliersResult.error);
        return;
      }

      const nextProducts = productsResult.data.items ?? [];
      setProducts(nextProducts);
      setLocations(locationsResult.data.items ?? []);
      setSuppliers(suppliersResult.data.items ?? []);
      setStatementProductId((current) => current || nextProducts[0]?.id || "");
      setCostProductId((current) => current || nextProducts[0]?.id || "");
    } finally {
      setLookupsLoading(false);
    }
  }, []);

  const loadStockSummary = useCallback(async (signal?: AbortSignal) => {
    setStockLoading(true);
    setError(null);
    const search = new URLSearchParams();
    if (stockAsOfDate) {
      search.set("as_of_date", stockAsOfDate);
    }
    if (stockLocationId) {
      search.set("location_id", stockLocationId);
    }

    try {
      const result = await fetchJson<{
        totals?: StockSummaryTotalRow[];
        details?: StockSummaryDetailRow[];
        error?: string;
      }>(`/api/reports/stock-summary?${search.toString()}`, {
        cache: "no-store",
        signal,
        fallbackError: "Failed to load stock summary.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setStockTotals(result.data.totals ?? []);
      setStockDetails(result.data.details ?? []);
    } finally {
      setStockLoading(false);
    }
  }, [stockAsOfDate, stockLocationId]);

  const loadItemStatement = useCallback(async () => {
    if (!statementProductId) {
      setError("Select an item first.");
      return;
    }
    setStatementLoading(true);
    setError(null);
    const search = new URLSearchParams();
    search.set("product_id", statementProductId);
    search.set("from_date", statementFromDate);
    search.set("to_date", statementToDate);
    if (statementLocationId) {
      search.set("location_id", statementLocationId);
    }

    try {
      const result = await fetchJson<{
        opening_qty?: number;
        rows?: ItemStatementRow[];
        error?: string;
      }>(`/api/reports/item-statement?${search.toString()}`, {
        cache: "no-store",
        fallbackError: "Failed to load item statement.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setStatementOpeningQty(Number(result.data.opening_qty ?? 0));
      setStatementRows(result.data.rows ?? []);
    } finally {
      setStatementLoading(false);
    }
  }, [statementProductId, statementFromDate, statementToDate, statementLocationId]);

  const loadCostEvolution = useCallback(async () => {
    if (!costProductId) {
      setError("Select an item first.");
      return;
    }
    setCostLoading(true);
    setError(null);
    const search = new URLSearchParams();
    search.set("product_id", costProductId);
    search.set("from_date", costFromDate);
    search.set("to_date", costToDate);
    if (costLocationId) {
      search.set("location_id", costLocationId);
    }

    try {
      const result = await fetchJson<{
        rows?: ItemCostEvolutionRow[];
        summary?: {
          min_unit_cost: number;
          max_unit_cost: number;
          avg_unit_cost: number;
          total_qty_in: number;
          total_value: number;
        };
        error?: string;
      }>(`/api/reports/item-cost-evolution?${search.toString()}`, {
        cache: "no-store",
        fallbackError: "Failed to load item cost evolution.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCostRows(result.data.rows ?? []);
      setCostSummary(
        result.data.summary ?? {
          min_unit_cost: 0,
          max_unit_cost: 0,
          avg_unit_cost: 0,
          total_qty_in: 0,
          total_value: 0,
        },
      );
    } finally {
      setCostLoading(false);
    }
  }, [costProductId, costFromDate, costToDate, costLocationId]);

  const loadSupplierReport = useCallback(async (signal?: AbortSignal) => {
    setSupplierLoading(true);
    setError(null);
    const search = new URLSearchParams();
    search.set("from_date", supplierFromDate);
    search.set("to_date", supplierToDate);
    if (supplierFilterId) {
      search.set("supplier_id", supplierFilterId);
    }
    if (supplierStatusFilter) {
      search.set("status_filter", supplierStatusFilter);
    }

    try {
      const result = await fetchJson<{
        rows?: SupplierRow[];
        summary?: SupplierSummary;
        error?: string;
      }>(`/api/reports/supplier?${search.toString()}`, {
        cache: "no-store",
        signal,
        fallbackError: "Failed to load supplier report.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSupplierRows(result.data.rows ?? []);
      setSupplierSummary(
        result.data.summary ?? {
          total_invoiced: 0,
          total_credits: 0,
          total_paid: 0,
          net_pending: 0,
        },
      );
    } finally {
      setSupplierLoading(false);
    }
  }, [supplierFromDate, supplierToDate, supplierFilterId, supplierStatusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadMetrics(controller.signal),
      loadLookups(controller.signal),
      loadStockSummary(controller.signal),
      loadSupplierReport(controller.signal),
    ]).catch(
      () => setError("Failed to load report data."),
    );
    return () => controller.abort();
  }, [loadMetrics, loadLookups, loadStockSummary, loadSupplierReport]);

  const stockExportUrl = useMemo(
    () =>
      exportHref("stock-summary", {
        as_of_date: stockAsOfDate,
        location_id: stockLocationId || null,
        view: stockView,
      }),
    [stockAsOfDate, stockLocationId, stockView],
  );
  const statementExportUrl = useMemo(
    () =>
      exportHref("item-statement", {
        product_id: statementProductId,
        from_date: statementFromDate,
        to_date: statementToDate,
        location_id: statementLocationId || null,
      }),
    [statementProductId, statementFromDate, statementToDate, statementLocationId],
  );
  const costExportUrl = useMemo(
    () =>
      exportHref("item-cost-evolution", {
        product_id: costProductId,
        from_date: costFromDate,
        to_date: costToDate,
        location_id: costLocationId || null,
      }),
    [costProductId, costFromDate, costToDate, costLocationId],
  );
  const supplierExportUrl = useMemo(
    () =>
      exportHref("supplier", {
        from_date: supplierFromDate,
        to_date: supplierToDate,
        supplier_id: supplierFilterId || null,
        status_filter: supplierStatusFilter || null,
      }),
    [supplierFromDate, supplierToDate, supplierFilterId, supplierStatusFilter],
  );

  function openPaymentDialog(row: SupplierRow) {
    setPaymentTarget(row);
    setPaymentAmount("");
    setPaymentDate(monthDefaults.today);
    setPaymentNote("");
    setPaymentError(null);
    setPaymentDialogOpen(true);
  }

  async function submitPayment() {
    if (!paymentTarget) {
      return;
    }
    const parsedAmount = Number(paymentAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setPaymentError("Payment amount must be greater than 0.");
      return;
    }
    if (parsedAmount > paymentTarget.pending_amount) {
      setPaymentError("Payment amount cannot exceed pending amount.");
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const result = await fetchJson<{ error?: string }>("/api/reports/supplier/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_document_id: paymentTarget.id,
          payment_date: paymentDate,
          amount: parsedAmount,
          note: paymentNote.trim() || null,
        }),
        fallbackError: "Failed to record payment.",
      });
      if (!result.ok) {
        setPaymentError(result.error);
        return;
      }

      setPaymentDialogOpen(false);
      setPaymentTarget(null);
      await loadSupplierReport();
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Analytics</p>
        <h1 className="ims-title text-[2.1rem]">Reports</h1>
        <p className="ims-subtitle">
          {companyName}: operational stock, movement, cost, and supplier payables.
        </p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="min-h-32">
          <p className="ims-kicker">Total SKUs</p>
          {metricsLoading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold">{metrics?.totalSkus ?? "-"}</p>
          )}
        </Card>
        <Card className="min-h-32">
          <p className="ims-kicker">Low Stock</p>
          {metricsLoading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold">{metrics?.lowStockCount ?? "-"}</p>
          )}
        </Card>
        <Card className="min-h-32">
          <p className="ims-kicker">Expiring Soon</p>
          {metricsLoading ? (
            <div className="ims-skeleton mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 text-3xl font-bold">{metrics?.expiringSoonCount ?? "-"}</p>
          )}
        </Card>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant={activeTab === "stock-summary" ? "secondary" : "ghost"} className="h-10" onClick={() => setActiveTab("stock-summary")}>Stock Summary</Button>
        <Button variant={activeTab === "item-statement" ? "secondary" : "ghost"} className="h-10" onClick={() => setActiveTab("item-statement")}>Item Statement</Button>
        <Button variant={activeTab === "item-cost-evolution" ? "secondary" : "ghost"} className="h-10" onClick={() => setActiveTab("item-cost-evolution")}>Item Cost Evolution</Button>
        <Button variant={activeTab === "supplier" ? "secondary" : "ghost"} className="h-10" onClick={() => setActiveTab("supplier")}>Supplier Reports</Button>
      </div>

      {activeTab === "stock-summary" ? (
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Stock Summary</h2>
            <a href={stockExportUrl}><Button variant="outline" className="h-9">Export CSV</Button></a>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <Input type="date" value={stockAsOfDate} className="h-11" onChange={(event) => setStockAsOfDate(event.target.value)} />
            <Select value={stockLocationId} className="h-11" onChange={(event) => setStockLocationId(event.target.value)}>
              <option value="">All branches</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{(location.code ?? "LOC")} - {location.name}</option>
              ))}
            </Select>
            <Select value={stockView} className="h-11" onChange={(event) => setStockView(event.target.value as "totals" | "details")}>
              <option value="totals">Branch Totals</option>
              <option value="details">Product by Branch</option>
            </Select>
            <Button className="h-11" onClick={() => loadStockSummary()} disabled={stockLoading}>{stockLoading ? "Loading..." : "Apply Filter"}</Button>
          </div>
          <div className="mt-4 max-h-[32rem] overflow-auto">
            <table className="ims-table">
              <thead className="ims-table-head">
                {stockView === "totals" ? (
                  <tr><th>Branch</th><th>Qty On Hand</th><th>Stock Value</th></tr>
                ) : (
                  <tr><th>Branch</th><th>SKU</th><th>Product</th><th>Qty On Hand</th><th>Stock Value</th></tr>
                )}
              </thead>
              <tbody>
                {stockView === "totals"
                  ? stockTotals.map((row) => (
                      <tr key={row.location_id} className="ims-table-row">
                        <td>{row.location_code} - {row.location_name}</td>
                        <td>{row.qty_on_hand}</td>
                        <td>{formatMoney(row.stock_value)}</td>
                      </tr>
                    ))
                  : stockDetails.map((row) => (
                      <tr key={`${row.location_id}:${row.product_id}`} className="ims-table-row">
                        <td>{row.location_code} - {row.location_name}</td>
                        <td>{row.sku}</td>
                        <td>{row.product_name}</td>
                        <td>{row.qty_on_hand}</td>
                        <td>{formatMoney(row.stock_value)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {stockView === "totals" && stockTotals.length === 0 ? <p className="ims-empty mt-3">No stock summary rows found.</p> : null}
            {stockView === "details" && stockDetails.length === 0 ? <p className="ims-empty mt-3">No stock detail rows found.</p> : null}
          </div>
        </Card>
      ) : null}

      {activeTab === "item-statement" ? (
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Item Statement</h2>
            <a href={statementExportUrl}><Button variant="outline" className="h-9">Export CSV</Button></a>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <Select value={statementProductId} className="h-11" onChange={(event) => setStatementProductId(event.target.value)} disabled={lookupsLoading}>
              <option value="">Select item</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{(product.sku ?? "SKU")} - {product.name}</option>
              ))}
            </Select>
            <Input type="date" value={statementFromDate} className="h-11" onChange={(event) => setStatementFromDate(event.target.value)} />
            <Input type="date" value={statementToDate} className="h-11" onChange={(event) => setStatementToDate(event.target.value)} />
            <Select value={statementLocationId} className="h-11" onChange={(event) => setStatementLocationId(event.target.value)}>
              <option value="">All branches</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{(location.code ?? "LOC")} - {location.name}</option>
              ))}
            </Select>
            <Button className="h-11" onClick={() => loadItemStatement()} disabled={statementLoading}>{statementLoading ? "Loading..." : "Apply Filter"}</Button>
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]">Opening Qty before {statementFromDate}: <strong>{statementOpeningQty}</strong></p>
          <div className="mt-4 max-h-[32rem] overflow-auto">
            <table className="ims-table">
              <thead className="ims-table-head">
                <tr><th>Occurred</th><th>Transaction</th><th>Type</th><th>Branch</th><th>Direction</th><th>Qty</th><th>Running Qty</th><th>Unit Cost</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {statementRows.map((row) => (
                  <tr key={`${row.occurred_at}:${row.tx_number ?? "none"}:${row.location_id}`} className="ims-table-row">
                    <td>{new Date(row.occurred_at).toLocaleString()}</td>
                    <td>{row.tx_number ?? "--"}</td>
                    <td>{row.transaction_type ?? "--"}</td>
                    <td>{row.location_code} - {row.location_name}</td>
                    <td>{row.direction}</td>
                    <td>{row.signed_qty}</td>
                    <td>{row.running_qty}</td>
                    <td>{formatMoney(row.unit_cost)}</td>
                    <td>{row.reason_code ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {statementRows.length === 0 ? <p className="ims-empty mt-3">No movement rows found for this item.</p> : null}
          </div>
        </Card>
      ) : null}

      {activeTab === "item-cost-evolution" ? (
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Item Cost Evolution</h2>
            <a href={costExportUrl}><Button variant="outline" className="h-9">Export CSV</Button></a>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <Select value={costProductId} className="h-11" onChange={(event) => setCostProductId(event.target.value)} disabled={lookupsLoading}>
              <option value="">Select item</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{(product.sku ?? "SKU")} - {product.name}</option>
              ))}
            </Select>
            <Input type="date" value={costFromDate} className="h-11" onChange={(event) => setCostFromDate(event.target.value)} />
            <Input type="date" value={costToDate} className="h-11" onChange={(event) => setCostToDate(event.target.value)} />
            <Select value={costLocationId} className="h-11" onChange={(event) => setCostLocationId(event.target.value)}>
              <option value="">All branches</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{(location.code ?? "LOC")} - {location.name}</option>
              ))}
            </Select>
            <Button className="h-11" onClick={() => loadCostEvolution()} disabled={costLoading}>{costLoading ? "Loading..." : "Apply Filter"}</Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
            <span>Min: {formatMoney(costSummary.min_unit_cost)}</span>
            <span>Max: {formatMoney(costSummary.max_unit_cost)}</span>
            <span>Avg: {formatMoney(costSummary.avg_unit_cost)}</span>
            <span>Total Qty: {costSummary.total_qty_in}</span>
            <span>Total Value: {formatMoney(costSummary.total_value)}</span>
          </div>

          <div className="mt-4 max-h-[32rem] overflow-auto">
            <table className="ims-table">
              <thead className="ims-table-head">
                <tr><th>Occurred</th><th>Transaction</th><th>Type</th><th>Branch</th><th>Qty In</th><th>Unit Cost</th><th>Line Value</th><th>Cost Source</th></tr>
              </thead>
              <tbody>
                {costRows.map((row) => (
                  <tr key={`${row.occurred_at}:${row.tx_number ?? "none"}:${row.location_id}`} className="ims-table-row">
                    <td>{new Date(row.occurred_at).toLocaleString()}</td>
                    <td>{row.tx_number ?? "--"}</td>
                    <td>{row.transaction_type ?? "--"}</td>
                    <td>{row.location_code} - {row.location_name}</td>
                    <td>{row.qty_in}</td>
                    <td>{formatMoney(row.unit_cost)}</td>
                    <td>{formatMoney(row.line_value)}</td>
                    <td>{row.cost_source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {costRows.length === 0 ? <p className="ims-empty mt-3">No inbound cost rows found for this item.</p> : null}
          </div>
        </Card>
      ) : null}

      {activeTab === "supplier" ? (
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Supplier Reports</h2>
            <a href={supplierExportUrl}><Button variant="outline" className="h-9">Export CSV</Button></a>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Card className="min-h-20 p-3"><p className="ims-kicker">Invoiced</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.total_invoiced)}</p></Card>
            <Card className="min-h-20 p-3"><p className="ims-kicker">Credits</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.total_credits)}</p></Card>
            <Card className="min-h-20 p-3"><p className="ims-kicker">Paid</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.total_paid)}</p></Card>
            <Card className="min-h-20 p-3"><p className="ims-kicker">Net Pending</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.net_pending)}</p></Card>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-6">
            <Input type="date" value={supplierFromDate} className="h-11" onChange={(event) => setSupplierFromDate(event.target.value)} />
            <Input type="date" value={supplierToDate} className="h-11" onChange={(event) => setSupplierToDate(event.target.value)} />
            <Select value={supplierFilterId} className="h-11" onChange={(event) => setSupplierFilterId(event.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{(supplier.code ?? "SUP")} - {supplier.name}</option>
              ))}
            </Select>
            <Select value={supplierStatusFilter} className="h-11" onChange={(event) => setSupplierStatusFilter(event.target.value as "" | "OPEN" | "VOID")}>
              <option value="">All statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="VOID">VOID</option>
            </Select>
            <Button className="h-11" onClick={() => loadSupplierReport()} disabled={supplierLoading}>{supplierLoading ? "Loading..." : "Apply Filter"}</Button>
          </div>

          <div className="mt-4 max-h-[34rem] overflow-auto">
            <table className="ims-table">
              <thead className="ims-table-head">
                <tr><th>Supplier</th><th>Document No</th><th>Type</th><th>Date</th><th>Branch</th><th>Transaction</th><th>Gross</th><th>Paid</th><th>Pending</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {supplierRows.map((row) => (
                  <tr key={row.id} className="ims-table-row">
                    <td>{row.supplier_code} - {row.supplier_name}</td>
                    <td>{row.document_no}</td>
                    <td>{row.document_type}</td>
                    <td>{row.document_date}</td>
                    <td>{row.location_code} - {row.location_name}</td>
                    <td>{row.transaction_number ?? "--"}</td>
                    <td>{formatMoney(row.gross_amount)}</td>
                    <td>{formatMoney(row.paid_amount)}</td>
                    <td>{formatMoney(row.pending_amount)}</td>
                    <td>{row.status}</td>
                    <td>
                      {row.can_record_payment ? (
                        <Button className="h-9" onClick={() => openPaymentDialog(row)}>Record Payment</Button>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {supplierRows.length === 0 ? <p className="ims-empty mt-3">No supplier documents found for this filter.</p> : null}
          </div>
        </Card>
      ) : null}

      {paymentDialogOpen && paymentTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Record supplier payment">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">Record Payment</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{paymentTarget.supplier_code} - {paymentTarget.supplier_name}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Pending: {formatMoney(paymentTarget.pending_amount)}</p>
            <div className="mt-4 space-y-3">
              <label className="space-y-1">
                <span className="ims-field-label mb-0">Payment date</span>
                <Input type="date" className="h-10" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="ims-field-label mb-0">Amount</span>
                <Input type="number" min={0.01} step={0.01} className="h-10" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="ims-field-label mb-0">Note (optional)</span>
                <Input className="h-10" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
              </label>
            </div>
            {paymentError ? <p className="ims-alert-danger mt-3 text-sm">{paymentError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" className="h-10" onClick={() => {
                setPaymentDialogOpen(false);
                setPaymentTarget(null);
              }}>Cancel</Button>
              <Button className="h-10" onClick={() => submitPayment()} disabled={paymentLoading}>{paymentLoading ? "Saving..." : "Save Payment"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
