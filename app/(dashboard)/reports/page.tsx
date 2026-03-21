
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { ExportActions } from "@/components/ui/export-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterPopover } from "@/components/ui/filter-popover";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExportColumn } from "@/lib/export/contracts";
import {
  formatSystemCurrency,
  getSystemCurrencyInputStep,
  normalizeSystemCurrencyValue,
} from "@/lib/settings/system-currency";
import {
  buildFilterStorageKey,
  readLocalFilterState,
  removeLocalFilterState,
  writeLocalFilterState,
} from "@/lib/utils/local-filter-storage";
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

type StockSummaryFilterState = {
  stockAsOfDate: string;
  stockLocationId: string;
  stockView: "totals" | "details";
};

type ItemStatementFilterState = {
  statementProductId: string;
  statementFromDate: string;
  statementToDate: string;
  statementLocationId: string;
};

type ItemCostFilterState = {
  costProductId: string;
  costFromDate: string;
  costToDate: string;
  costLocationId: string;
};

type SupplierFilterState = {
  supplierFromDate: string;
  supplierToDate: string;
  supplierFilterId: string;
  supplierStatusFilter: "" | "OPEN" | "VOID";
};

type ReportTab = "stock-summary" | "item-statement" | "item-cost-evolution" | "supplier";

const STOCK_TOTAL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "location_code", label: "Location Code" },
  { key: "location_name", label: "Location Name" },
  { key: "qty_on_hand", label: "Qty On Hand" },
  { key: "stock_value", label: "Stock Value" },
];

const STOCK_DETAIL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "location_code", label: "Location Code" },
  { key: "location_name", label: "Location Name" },
  { key: "sku", label: "SKU" },
  { key: "product_name", label: "Product Name" },
  { key: "qty_on_hand", label: "Qty On Hand" },
  { key: "stock_value", label: "Stock Value" },
];

const STATEMENT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "row_type", label: "Row Type" },
  { key: "occurred_at", label: "Occurred At" },
  { key: "tx_number", label: "Transaction Number" },
  { key: "transaction_type", label: "Transaction Type" },
  { key: "transaction_status", label: "Transaction Status" },
  { key: "location_code", label: "Location Code" },
  { key: "location_name", label: "Location Name" },
  { key: "direction", label: "Direction" },
  { key: "qty", label: "Quantity" },
  { key: "signed_qty", label: "Signed Quantity" },
  { key: "running_qty", label: "Running Quantity" },
  { key: "unit_cost", label: "Unit Cost" },
  { key: "reason_code", label: "Reason Code" },
];

const COST_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "occurred_at", label: "Occurred At" },
  { key: "tx_number", label: "Transaction Number" },
  { key: "transaction_type", label: "Transaction Type" },
  { key: "location_code", label: "Location Code" },
  { key: "location_name", label: "Location Name" },
  { key: "qty_in", label: "Quantity In" },
  { key: "unit_cost", label: "Unit Cost" },
  { key: "line_value", label: "Line Value" },
  { key: "cost_source", label: "Cost Source" },
  { key: "lot_number", label: "Lot Number" },
  { key: "expiry_date", label: "Expiry Date" },
];

const SUPPLIER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "supplier_code", label: "Supplier Code" },
  { key: "supplier_name", label: "Supplier Name" },
  { key: "document_no", label: "Document Number" },
  { key: "document_type", label: "Document Type" },
  { key: "document_date", label: "Document Date" },
  { key: "location_code", label: "Location Code" },
  { key: "location_name", label: "Location Name" },
  { key: "transaction_number", label: "Transaction Number" },
  { key: "gross_amount", label: "Gross Amount" },
  { key: "paid_amount", label: "Paid Amount" },
  { key: "pending_amount", label: "Pending Amount" },
  { key: "status", label: "Status" },
];

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

const monthDefaults = getCurrentMonthRange();

export default function ReportsPage() {
  const { companyName, userId: authUserId, currencyCode } = useDashboardSession();
  const formatMoney = useCallback(
    (value: number | null | undefined) => formatSystemCurrency(value, currencyCode),
    [currencyCode],
  );
  const [activeTab, setActiveTab] = useState<ReportTab>("stock-summary");
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [statementRestorePending, setStatementRestorePending] = useState(false);
  const [costRestorePending, setCostRestorePending] = useState(false);
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
  const [, setStockLoading] = useState(false);

  const [statementProductId, setStatementProductId] = useState("");
  const [statementFromDate, setStatementFromDate] = useState(monthDefaults.fromDate);
  const [statementToDate, setStatementToDate] = useState(monthDefaults.toDate);
  const [statementLocationId, setStatementLocationId] = useState("");
  const [statementOpeningQty, setStatementOpeningQty] = useState(0);
  const [statementRows, setStatementRows] = useState<ItemStatementRow[]>([]);
  const [, setStatementLoading] = useState(false);

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
  const [, setCostLoading] = useState(false);

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
  const [, setSupplierLoading] = useState(false);
  const [supplierLoaded, setSupplierLoaded] = useState(false);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<SupplierRow | null>(null);
  const [paymentDate, setPaymentDate] = useState(monthDefaults.today);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const stockStorageKey = buildFilterStorageKey(authUserId, "reports", "stock-summary");
  const statementStorageKey = buildFilterStorageKey(authUserId, "reports", "item-statement");
  const costStorageKey = buildFilterStorageKey(authUserId, "reports", "item-cost-evolution");
  const supplierStorageKey = buildFilterStorageKey(authUserId, "reports", "supplier");

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
    const savedStock = readLocalFilterState<Partial<StockSummaryFilterState>>(stockStorageKey);
    setStockAsOfDate(
      typeof savedStock?.stockAsOfDate === "string"
        ? savedStock.stockAsOfDate
        : monthDefaults.today,
    );
    setStockLocationId(
      typeof savedStock?.stockLocationId === "string" ? savedStock.stockLocationId : "",
    );
    setStockView(savedStock?.stockView === "details" ? "details" : "totals");

    const savedStatement =
      readLocalFilterState<Partial<ItemStatementFilterState>>(statementStorageKey);
    setStatementProductId(
      typeof savedStatement?.statementProductId === "string"
        ? savedStatement.statementProductId
        : "",
    );
    setStatementFromDate(
      typeof savedStatement?.statementFromDate === "string"
        ? savedStatement.statementFromDate
        : monthDefaults.fromDate,
    );
    setStatementToDate(
      typeof savedStatement?.statementToDate === "string"
        ? savedStatement.statementToDate
        : monthDefaults.toDate,
    );
    setStatementLocationId(
      typeof savedStatement?.statementLocationId === "string"
        ? savedStatement.statementLocationId
        : "",
    );
    setStatementRestorePending(Boolean(savedStatement));

    const savedCost = readLocalFilterState<Partial<ItemCostFilterState>>(costStorageKey);
    setCostProductId(
      typeof savedCost?.costProductId === "string" ? savedCost.costProductId : "",
    );
    setCostFromDate(
      typeof savedCost?.costFromDate === "string"
        ? savedCost.costFromDate
        : monthDefaults.fromDate,
    );
    setCostToDate(
      typeof savedCost?.costToDate === "string" ? savedCost.costToDate : monthDefaults.toDate,
    );
    setCostLocationId(
      typeof savedCost?.costLocationId === "string" ? savedCost.costLocationId : "",
    );
    setCostRestorePending(Boolean(savedCost));

    const savedSupplier =
      readLocalFilterState<Partial<SupplierFilterState>>(supplierStorageKey);
    setSupplierFromDate(
      typeof savedSupplier?.supplierFromDate === "string"
        ? savedSupplier.supplierFromDate
        : monthDefaults.fromDate,
    );
    setSupplierToDate(
      typeof savedSupplier?.supplierToDate === "string"
        ? savedSupplier.supplierToDate
        : monthDefaults.toDate,
    );
    setSupplierFilterId(
      typeof savedSupplier?.supplierFilterId === "string"
        ? savedSupplier.supplierFilterId
        : "",
    );
    setSupplierStatusFilter(
      savedSupplier?.supplierStatusFilter === "OPEN" || savedSupplier?.supplierStatusFilter === "VOID"
        ? savedSupplier.supplierStatusFilter
        : "",
    );

    setFiltersHydrated(true);
  }, [costStorageKey, statementStorageKey, stockStorageKey, supplierStorageKey]);

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    const controller = new AbortController();
    Promise.all([
      loadMetrics(controller.signal),
      loadLookups(controller.signal),
      loadStockSummary(controller.signal),
    ]).catch(() => setError("Failed to load report data."));
    return () => controller.abort();
  }, [filtersHydrated, loadLookups, loadMetrics, loadStockSummary]);

  useEffect(() => {
    if (!filtersHydrated || activeTab !== "supplier" || supplierLoaded) {
      return;
    }

    setSupplierLoaded(true);
    void loadSupplierReport();
  }, [activeTab, filtersHydrated, loadSupplierReport, supplierLoaded]);

  useEffect(() => {
    if (!filtersHydrated || activeTab !== "item-statement" || !statementRestorePending) {
      return;
    }

    setStatementRestorePending(false);
    void loadItemStatement();
  }, [activeTab, filtersHydrated, loadItemStatement, statementRestorePending]);

  useEffect(() => {
    if (!filtersHydrated || activeTab !== "item-cost-evolution" || !costRestorePending) {
      return;
    }

    setCostRestorePending(false);
    void loadCostEvolution();
  }, [activeTab, costRestorePending, filtersHydrated, loadCostEvolution]);

  const stockFiltersApplied =
    stockAsOfDate !== monthDefaults.today ||
    stockLocationId !== "" ||
    stockView !== "totals";
  const statementFiltersApplied =
    statementFromDate !== monthDefaults.fromDate ||
    statementToDate !== monthDefaults.toDate ||
    statementLocationId !== "";
  const costFiltersApplied =
    costFromDate !== monthDefaults.fromDate ||
    costToDate !== monthDefaults.toDate ||
    costLocationId !== "";
  const supplierFiltersApplied =
    supplierFromDate !== monthDefaults.fromDate ||
    supplierToDate !== monthDefaults.toDate ||
    supplierFilterId !== "" ||
    supplierStatusFilter !== "";

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    if (
      stockAsOfDate === monthDefaults.today &&
      stockLocationId === "" &&
      stockView === "totals"
    ) {
      removeLocalFilterState(stockStorageKey);
      return;
    }

    writeLocalFilterState(stockStorageKey, {
      stockAsOfDate,
      stockLocationId,
      stockView,
    } satisfies StockSummaryFilterState);
  }, [
    filtersHydrated,
    stockAsOfDate,
    stockLocationId,
    stockStorageKey,
    stockView,
  ]);

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    const defaultProductId = products[0]?.id ?? "";
    if (
      statementProductId === defaultProductId &&
      statementFromDate === monthDefaults.fromDate &&
      statementToDate === monthDefaults.toDate &&
      statementLocationId === ""
    ) {
      removeLocalFilterState(statementStorageKey);
      return;
    }

    writeLocalFilterState(statementStorageKey, {
      statementProductId,
      statementFromDate,
      statementToDate,
      statementLocationId,
    } satisfies ItemStatementFilterState);
  }, [
    filtersHydrated,
    products,
    statementFromDate,
    statementLocationId,
    statementProductId,
    statementStorageKey,
    statementToDate,
  ]);

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    const defaultProductId = products[0]?.id ?? "";
    if (
      costProductId === defaultProductId &&
      costFromDate === monthDefaults.fromDate &&
      costToDate === monthDefaults.toDate &&
      costLocationId === ""
    ) {
      removeLocalFilterState(costStorageKey);
      return;
    }

    writeLocalFilterState(costStorageKey, {
      costProductId,
      costFromDate,
      costToDate,
      costLocationId,
    } satisfies ItemCostFilterState);
  }, [
    costFromDate,
    costLocationId,
    costProductId,
    costStorageKey,
    costToDate,
    filtersHydrated,
    products,
  ]);

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    if (
      supplierFromDate === monthDefaults.fromDate &&
      supplierToDate === monthDefaults.toDate &&
      supplierFilterId === "" &&
      supplierStatusFilter === ""
    ) {
      removeLocalFilterState(supplierStorageKey);
      return;
    }

    writeLocalFilterState(supplierStorageKey, {
      supplierFromDate,
      supplierToDate,
      supplierFilterId,
      supplierStatusFilter,
    } satisfies SupplierFilterState);
  }, [
    filtersHydrated,
    supplierFilterId,
    supplierFromDate,
    supplierStatusFilter,
    supplierStorageKey,
    supplierToDate,
  ]);
  const stockExportColumns = useMemo(
    () => (stockView === "totals" ? STOCK_TOTAL_EXPORT_COLUMNS : STOCK_DETAIL_EXPORT_COLUMNS),
    [stockView],
  );
  const stockExportRows = useMemo(
    () =>
      (stockView === "totals" ? stockTotals : stockDetails).map((row) =>
        stockView === "totals"
          ? {
              location_code: row.location_code,
              location_name: row.location_name,
              qty_on_hand: row.qty_on_hand,
              stock_value: row.stock_value,
            }
          : {
              location_code: (row as StockSummaryDetailRow).location_code,
              location_name: (row as StockSummaryDetailRow).location_name,
              sku: (row as StockSummaryDetailRow).sku,
              product_name: (row as StockSummaryDetailRow).product_name,
              qty_on_hand: (row as StockSummaryDetailRow).qty_on_hand,
              stock_value: (row as StockSummaryDetailRow).stock_value,
            },
      ),
    [stockDetails, stockTotals, stockView],
  );
  const stockFilterSummary = useMemo(
    () => [
      `As of: ${stockAsOfDate}`,
      `Location: ${stockLocationId ? locations.find((item) => item.id === stockLocationId)?.name ?? "Selected" : "All"}`,
      `View: ${stockView === "totals" ? "Totals" : "Details"}`,
    ],
    [locations, stockAsOfDate, stockLocationId, stockView],
  );
  const statementExportRows = useMemo(() => {
    const location = locations.find((item) => item.id === statementLocationId);
    return [
      {
        row_type: "OPENING",
        occurred_at: `${statementFromDate}T00:00:00.000Z`,
        tx_number: "",
        transaction_type: "OPENING",
        transaction_status: "",
        location_code: location?.code ?? "",
        location_name: location?.name ?? "",
        direction: "",
        qty: "",
        signed_qty: "",
        running_qty: statementOpeningQty,
        unit_cost: "",
        reason_code: "",
      },
      ...statementRows.map((row) => ({
        row_type: "MOVEMENT",
        occurred_at: row.occurred_at,
        tx_number: row.tx_number ?? "",
        transaction_type: row.transaction_type ?? "",
        transaction_status: row.transaction_status ?? "",
        location_code: row.location_code,
        location_name: row.location_name,
        direction: row.direction,
        qty: row.qty,
        signed_qty: row.signed_qty,
        running_qty: row.running_qty,
        unit_cost: row.unit_cost,
        reason_code: row.reason_code ?? "",
      })),
    ];
  }, [
    locations,
    statementFromDate,
    statementLocationId,
    statementOpeningQty,
    statementRows,
  ]);
  const statementFilterSummary = useMemo(
    () => [
      `Product: ${products.find((item) => item.id === statementProductId)?.name ?? "Selected"}`,
      `From: ${statementFromDate}`,
      `To: ${statementToDate}`,
      `Location: ${statementLocationId ? locations.find((item) => item.id === statementLocationId)?.name ?? "Selected" : "All"}`,
    ],
    [
      locations,
      products,
      statementFromDate,
      statementLocationId,
      statementProductId,
      statementToDate,
    ],
  );
  const costExportRows = useMemo(
    () =>
      costRows.map((row) => ({
        occurred_at: row.occurred_at,
        tx_number: row.tx_number ?? "",
        transaction_type: row.transaction_type ?? "",
        location_code: row.location_code,
        location_name: row.location_name,
        qty_in: row.qty_in,
        unit_cost: row.unit_cost,
        line_value: row.line_value,
        cost_source: row.cost_source,
        lot_number: row.lot_number ?? "",
        expiry_date: row.expiry_date ?? "",
      })),
    [costRows],
  );
  const costFilterSummary = useMemo(
    () => [
      `Product: ${products.find((item) => item.id === costProductId)?.name ?? "Selected"}`,
      `From: ${costFromDate}`,
      `To: ${costToDate}`,
      `Location: ${costLocationId ? locations.find((item) => item.id === costLocationId)?.name ?? "Selected" : "All"}`,
    ],
    [costFromDate, costLocationId, costProductId, costToDate, locations, products],
  );
  const supplierExportRows = useMemo(
    () =>
      supplierRows.map((row) => ({
        supplier_code: row.supplier_code,
        supplier_name: row.supplier_name,
        document_no: row.document_no,
        document_type: row.document_type,
        document_date: row.document_date,
        location_code: row.location_code,
        location_name: row.location_name,
        transaction_number: row.transaction_number ?? "",
        gross_amount: row.gross_amount,
        paid_amount: row.paid_amount,
        pending_amount: row.pending_amount,
        status: row.status,
      })),
    [supplierRows],
  );
  const supplierFilterSummary = useMemo(
    () => [
      `From: ${supplierFromDate}`,
      `To: ${supplierToDate}`,
      `Supplier: ${supplierFilterId ? suppliers.find((item) => item.id === supplierFilterId)?.name ?? "Selected" : "All"}`,
      `Status: ${supplierStatusFilter || "All"}`,
    ],
    [supplierFilterId, supplierFromDate, supplierStatusFilter, supplierToDate, suppliers],
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
    const normalizedAmount = normalizeSystemCurrencyValue(paymentAmount, currencyCode);
    if (
      normalizedAmount == null ||
      !Number.isFinite(normalizedAmount) ||
      normalizedAmount <= 0
    ) {
      setPaymentError("Payment amount must be greater than 0.");
      return;
    }
    const pendingAmount =
      normalizeSystemCurrencyValue(paymentTarget.pending_amount, currencyCode) ?? 0;
    if (normalizedAmount > pendingAmount) {
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
          amount: normalizedAmount,
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
        <h1 className="ims-title">Reports</h1>
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
        <Button variant={activeTab === "stock-summary" ? "secondary" : "ghost"} className="ims-control-md" onClick={() => setActiveTab("stock-summary")}>Stock Summary</Button>
        <Button variant={activeTab === "item-statement" ? "secondary" : "ghost"} className="ims-control-md" onClick={() => setActiveTab("item-statement")}>Item Statement</Button>
        <Button variant={activeTab === "item-cost-evolution" ? "secondary" : "ghost"} className="ims-control-md" onClick={() => setActiveTab("item-cost-evolution")}>Item Cost Evolution</Button>
        <Button variant={activeTab === "supplier" ? "secondary" : "ghost"} className="ims-control-md" onClick={() => setActiveTab("supplier")}>Supplier Reports</Button>
      </div>

      {activeTab === "stock-summary" ? (
        <Card className="min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Stock Summary</h2>
            <ExportActions
              title="Stock Summary"
              filenameBase="stock-summary"
              columns={stockExportColumns}
              rows={stockExportRows}
              filterSummary={stockFilterSummary}
              emptyMessage="No stock summary data available."
              buttonClassName="ims-control-sm"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <FilterPopover
              title="Stock Summary Filters"
              applied={stockFiltersApplied}
              onApply={() => loadStockSummary()}
              onClear={() => {
                setStockAsOfDate(monthDefaults.today);
                setStockLocationId("");
                setStockView("totals");
                removeLocalFilterState(stockStorageKey);
              }}
            >
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="ims-field-label mb-0">As of date</span>
                  <Input
                    type="date"
                    value={stockAsOfDate}
                    className="ims-control-lg"
                    onChange={(event) => setStockAsOfDate(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">Branch</span>
                  <Select
                    value={stockLocationId}
                    className="ims-control-lg"
                    onChange={(event) => setStockLocationId(event.target.value)}
                  >
                    <option value="">All branches</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {(location.code ?? "LOC")} - {location.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">View</span>
                  <Select
                    value={stockView}
                    className="ims-control-lg"
                    onChange={(event) =>
                      setStockView(event.target.value as "totals" | "details")
                    }
                  >
                    <option value="totals">Branch Totals</option>
                    <option value="details">Product by Branch</option>
                  </Select>
                </label>
              </div>
            </FilterPopover>
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
            <ExportActions
              title="Item Statement"
              filenameBase="item-statement"
              columns={STATEMENT_EXPORT_COLUMNS}
              rows={statementExportRows}
              filterSummary={statementFilterSummary}
              emptyMessage="No item statement rows available."
              buttonClassName="ims-control-sm"
              printOrientation="landscape"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <FilterPopover
              title="Item Statement Filters"
              applied={statementFiltersApplied}
              onApply={() => loadItemStatement()}
              onClear={() => {
                setStatementProductId(products[0]?.id || "");
                setStatementFromDate(monthDefaults.fromDate);
                setStatementToDate(monthDefaults.toDate);
                setStatementLocationId("");
                removeLocalFilterState(statementStorageKey);
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="ims-field-label mb-0">Item</span>
                  <Select
                    value={statementProductId}
                    className="ims-control-lg"
                    onChange={(event) => setStatementProductId(event.target.value)}
                    disabled={lookupsLoading}
                  >
                    <option value="">Select item</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {(product.sku ?? "SKU")} - {product.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">Branch</span>
                  <Select
                    value={statementLocationId}
                    className="ims-control-lg"
                    onChange={(event) => setStatementLocationId(event.target.value)}
                  >
                    <option value="">All branches</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {(location.code ?? "LOC")} - {location.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">From date</span>
                  <Input
                    type="date"
                    value={statementFromDate}
                    className="ims-control-lg"
                    onChange={(event) => setStatementFromDate(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">To date</span>
                  <Input
                    type="date"
                    value={statementToDate}
                    className="ims-control-lg"
                    onChange={(event) => setStatementToDate(event.target.value)}
                  />
                </label>
              </div>
            </FilterPopover>
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
            <ExportActions
              title="Item Cost Evolution"
              filenameBase="item-cost-evolution"
              columns={COST_EXPORT_COLUMNS}
              rows={costExportRows}
              filterSummary={costFilterSummary}
              emptyMessage="No cost evolution rows available."
              buttonClassName="ims-control-sm"
              printOrientation="landscape"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <FilterPopover
              title="Item Cost Filters"
              applied={costFiltersApplied}
              onApply={() => loadCostEvolution()}
              onClear={() => {
                setCostProductId(products[0]?.id || "");
                setCostFromDate(monthDefaults.fromDate);
                setCostToDate(monthDefaults.toDate);
                setCostLocationId("");
                removeLocalFilterState(costStorageKey);
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="ims-field-label mb-0">Item</span>
                  <Select
                    value={costProductId}
                    className="ims-control-lg"
                    onChange={(event) => setCostProductId(event.target.value)}
                    disabled={lookupsLoading}
                  >
                    <option value="">Select item</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {(product.sku ?? "SKU")} - {product.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">Branch</span>
                  <Select
                    value={costLocationId}
                    className="ims-control-lg"
                    onChange={(event) => setCostLocationId(event.target.value)}
                  >
                    <option value="">All branches</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {(location.code ?? "LOC")} - {location.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">From date</span>
                  <Input
                    type="date"
                    value={costFromDate}
                    className="ims-control-lg"
                    onChange={(event) => setCostFromDate(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">To date</span>
                  <Input
                    type="date"
                    value={costToDate}
                    className="ims-control-lg"
                    onChange={(event) => setCostToDate(event.target.value)}
                  />
                </label>
              </div>
            </FilterPopover>
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
            <ExportActions
              title="Supplier Report"
              filenameBase="supplier-report"
              columns={SUPPLIER_EXPORT_COLUMNS}
              rows={supplierExportRows}
              filterSummary={supplierFilterSummary}
              emptyMessage="No supplier rows available."
              buttonClassName="ims-control-sm"
              printOrientation="landscape"
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Card className="min-h-20 p-3"><p className="ims-kicker">Invoiced</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.total_invoiced)}</p></Card>
            <Card className="min-h-20 p-3"><p className="ims-kicker">Credits</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.total_credits)}</p></Card>
            <Card className="min-h-20 p-3"><p className="ims-kicker">Paid</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.total_paid)}</p></Card>
            <Card className="min-h-20 p-3"><p className="ims-kicker">Net Pending</p><p className="mt-1 text-xl font-semibold">{formatMoney(supplierSummary.net_pending)}</p></Card>
          </div>

          <div className="mt-4 flex justify-end">
            <FilterPopover
              title="Supplier Report Filters"
              applied={supplierFiltersApplied}
              onApply={() => loadSupplierReport()}
              onClear={() => {
                setSupplierFromDate(monthDefaults.fromDate);
                setSupplierToDate(monthDefaults.toDate);
                setSupplierFilterId("");
                setSupplierStatusFilter("");
                removeLocalFilterState(supplierStorageKey);
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="ims-field-label mb-0">From date</span>
                  <Input
                    type="date"
                    value={supplierFromDate}
                    className="ims-control-lg"
                    onChange={(event) => setSupplierFromDate(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">To date</span>
                  <Input
                    type="date"
                    value={supplierToDate}
                    className="ims-control-lg"
                    onChange={(event) => setSupplierToDate(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">Supplier</span>
                  <Select
                    value={supplierFilterId}
                    className="ims-control-lg"
                    onChange={(event) => setSupplierFilterId(event.target.value)}
                  >
                    <option value="">All suppliers</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {(supplier.code ?? "SUP")} - {supplier.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="ims-field-label mb-0">Status</span>
                  <Select
                    value={supplierStatusFilter}
                    className="ims-control-lg"
                    onChange={(event) =>
                      setSupplierStatusFilter(event.target.value as "" | "OPEN" | "VOID")
                    }
                  >
                    <option value="">All statuses</option>
                    <option value="OPEN">OPEN</option>
                    <option value="VOID">VOID</option>
                  </Select>
                </label>
              </div>
            </FilterPopover>
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
                        <Button className="ims-control-sm" onClick={() => openPaymentDialog(row)}>Record Payment</Button>
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
                <Input type="date" className="ims-control-md" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="ims-field-label mb-0">Amount</span>
                <Input
                  type="number"
                  min={getSystemCurrencyInputStep(currencyCode)}
                  step={getSystemCurrencyInputStep(currencyCode)}
                  className="ims-control-md"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="ims-field-label mb-0">Note (optional)</span>
                <Input className="ims-control-md" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
              </label>
            </div>
            {paymentError ? <p className="ims-alert-danger mt-3 text-sm">{paymentError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" className="ims-control-md" onClick={() => {
                setPaymentDialogOpen(false);
                setPaymentTarget(null);
              }}>Cancel</Button>
              <Button className="ims-control-md" onClick={() => submitPayment()} disabled={paymentLoading}>{paymentLoading ? "Saving..." : "Save Payment"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
