"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import {
  MasterRowLimitControl,
  MasterTablePagination,
  paginateRows,
  type RowLimitOption,
} from "@/components/master/master-table-pagination";
import {
  buildDefaultColumnVisibility,
  useMasterColumns,
  type MasterColumnDefinition,
} from "@/components/master/use-master-columns";
import type { ExportColumn } from "@/lib/export/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fetchAllHistoryItems } from "./fetch-all-history-items";
import { TransactionListSettingsMenu } from "./transaction-list-settings-menu";
import { TransactionRowActionsMenu } from "./transaction-row-actions-menu";
import { useHistoryAutoRefresh } from "./use-history-auto-refresh";

type TxStatus = "DRAFT" | "SUBMITTED" | "POSTED" | "REVERSED" | "CANCELLED";

type TxLine = {
  id: string;
  product_id: string;
  product_sku_snapshot: string | null;
  product_name_snapshot: string | null;
  product_barcode_snapshot: string | null;
  qty: number;
  lot_number: string | null;
  expiry_date: string | null;
  unit_cost: number | null;
  reason_code: string | null;
};

type Tx = {
  id: string;
  tx_number: string;
  type: "ADJUSTMENT";
  status: TxStatus;
  source_location_id: string | null;
  destination_location_id: string | null;
  created_at: string;
  inventory_transaction_lines?: TxLine[];
};

type Lookup = {
  id: string;
  name: string;
  sku?: string;
  code?: string;
};

type AdjustmentHistoryColumnKey =
  | "number"
  | "mode"
  | "status"
  | "location"
  | "item"
  | "qty"
  | "created";

const ADJUSTMENT_HISTORY_DEFAULT_COLUMN_ORDER: readonly AdjustmentHistoryColumnKey[] = [
  "number",
  "mode",
  "status",
  "location",
  "item",
  "qty",
  "created",
];

const ADJUSTMENT_HISTORY_DEFAULT_COLUMN_VISIBILITY =
  buildDefaultColumnVisibility<AdjustmentHistoryColumnKey>(
    ADJUSTMENT_HISTORY_DEFAULT_COLUMN_ORDER,
  );

const ADJUSTMENT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "number", label: "Number" },
  { key: "mode", label: "Mode" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "items", label: "Items" },
  { key: "qty", label: "Qty" },
  { key: "created_at", label: "Created" },
];

function hasHistoricalProductSnapshot(line: TxLine | undefined) {
  return Boolean(
    line &&
      (line.product_sku_snapshot != null ||
        line.product_name_snapshot != null ||
        line.product_barcode_snapshot != null),
  );
}

function formatHistoricalProduct(line: TxLine | undefined, productById: Map<string, Lookup>) {
  if (!line) {
    return "--";
  }

  if (hasHistoricalProductSnapshot(line)) {
    const code = line.product_sku_snapshot?.trim() || "SKU";
    const name = line.product_name_snapshot?.trim() || null;
    return name ? `${code} - ${name}` : code;
  }

  const product = productById.get(line.product_id);
  return product ? `${product.sku ?? "SKU"} - ${product.name}` : "--";
}

type Mode = "opening" | "adjustment";

type Props = {
  mode: Mode;
  headerTitle: string;
  headerSubtitle: string;
  createTitle: string;
  historyTitle: string;
  detailBasePath?: string;
  summaryHistory?: boolean;
};

function getTransactionItemCount(transaction: Tx) {
  return transaction.inventory_transaction_lines?.length ?? 0;
}

function getTransactionTotalQty(transaction: Tx) {
  return (transaction.inventory_transaction_lines ?? []).reduce(
    (total, line) => total + Number(line.qty ?? 0),
    0,
  );
}

export function AdjustmentTransactionPage({
  mode,
  headerTitle,
  headerSubtitle,
  createTitle,
  historyTitle,
  detailBasePath,
  summaryHistory = false,
}: Props) {
  const { userId: authUserId } = useDashboardSession();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyRowLimit, setHistoryRowLimit] = useState<RowLimitOption>(10);
  const historyColumns = useMemo<
    readonly MasterColumnDefinition<AdjustmentHistoryColumnKey>[]
  >(
    () => [
      { key: "number", label: "Number" },
      { key: "mode", label: "Mode" },
      { key: "status", label: "Status" },
      { key: "location", label: "Location" },
      { key: "item", label: summaryHistory ? "Items" : "Product" },
      { key: "qty", label: "Qty" },
      { key: "created", label: "Created" },
    ],
    [summaryHistory],
  );
  const {
    orderedColumns: orderedHistoryColumns,
    visibleColumns: visibleHistoryColumns,
    columnVisibility: historyColumnVisibility,
    toggleColumnVisibility: toggleHistoryColumnVisibility,
    moveColumn: moveHistoryColumn,
    resetColumnPreferences: resetHistoryColumnPreferences,
  } = useMasterColumns({
    userId: authUserId,
    storageKey: `ims:${mode}:history:columns:${authUserId}`,
    columns: historyColumns,
    defaultOrder: ADJUSTMENT_HISTORY_DEFAULT_COLUMN_ORDER,
    defaultVisibility: ADJUSTMENT_HISTORY_DEFAULT_COLUMN_VISIBILITY,
  });

  const loadTransactions = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchAllHistoryItems<Tx>("/api/transactions?type=ADJUSTMENT", {
      signal,
      fallbackError: "Failed to load adjustments.",
    });

    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setTransactions(result.data);
  }, []);

  const loadLookups = useCallback(async () => {
    const [productsRes, locationsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/locations"),
    ]);
    const productsJson = (await productsRes.json()) as { items?: Lookup[]; error?: string };
    const locationsJson = (await locationsRes.json()) as {
      items?: Lookup[];
      error?: string;
    };
    if (!productsRes.ok) {
      setError(productsJson.error ?? "Failed to load products.");
      return;
    }
    if (!locationsRes.ok) {
      setError(locationsJson.error ?? "Failed to load locations.");
      return;
    }
    setProducts(productsJson.items ?? []);
    setLocations(locationsJson.items ?? []);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([loadTransactions(controller.signal), loadLookups()]).catch(() =>
      setError("Failed to load page data."),
    );
    return () => controller.abort();
  }, [loadLookups, loadTransactions]);

  useHistoryAutoRefresh(() => loadTransactions());

  const locationById = useMemo(() => {
    const mapped = new Map<string, Lookup>();
    for (const location of locations) {
      mapped.set(location.id, location);
    }
    return mapped;
  }, [locations]);

  const productById = useMemo(() => {
    const mapped = new Map<string, Lookup>();
    for (const product of products) {
      mapped.set(product.id, product);
    }
    return mapped;
  }, [products]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const reason = tx.inventory_transaction_lines?.[0]?.reason_code ?? null;
      if (mode === "opening") {
        return reason === "OPENING";
      }
      return reason !== "OPENING";
    });
  }, [mode, transactions]);
  const paginatedTransactions = useMemo(
    () => paginateRows(filteredTransactions, historyRowLimit, historyPage),
    [filteredTransactions, historyPage, historyRowLimit],
  );
  const historyExportRows = useMemo(
    () =>
      filteredTransactions.map((tx) => {
        const line = tx.inventory_transaction_lines?.[0];
        const reason = line?.reason_code ?? "";
        const isDecrease = reason === "DECREASE";
        const locationId = isDecrease ? tx.source_location_id : tx.destination_location_id;
        const location = locationId ? locationById.get(locationId) : undefined;
        const modeLabel =
          reason === "OPENING" ? "Opening" : isDecrease ? "Remove" : "Add";

        return {
          number: tx.tx_number,
          mode: modeLabel,
          status: tx.status,
          location: location ? `${location.code ?? "LOC"} - ${location.name}` : "--",
          items: summaryHistory
            ? `${getTransactionItemCount(tx)} item${getTransactionItemCount(tx) === 1 ? "" : "s"}`
            : formatHistoricalProduct(line, productById),
          qty: summaryHistory ? getTransactionTotalQty(tx) : line?.qty ?? "--",
          created_at: new Date(tx.created_at).toLocaleString(),
        };
      }),
    [filteredTransactions, locationById, productById, summaryHistory],
  );

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const locationId = String(formData.get("location_id") ?? "");
    const direction = String(formData.get("direction") ?? "ADD");
    const isDecrease = mode === "adjustment" && direction === "REMOVE";

    const reasonCode =
      mode === "opening" ? "OPENING" : isDecrease ? "DECREASE" : "INCREASE";

    const payload = {
      type: "ADJUSTMENT",
      source_location_id: isDecrease ? locationId : null,
      destination_location_id: isDecrease ? null : locationId,
      notes: String(formData.get("notes") ?? "") || null,
      lines: [
        {
          product_id: String(formData.get("product_id") ?? ""),
          qty: Number(formData.get("qty") ?? 0),
          lot_number: String(formData.get("lot_number") ?? "") || null,
          expiry_date: String(formData.get("expiry_date") ?? "") || null,
          unit_cost:
            String(formData.get("unit_cost") ?? "") === ""
              ? null
              : Number(formData.get("unit_cost")),
          reason_code: reasonCode,
        },
      ],
    };

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create adjustment.");
      setCreateLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    await loadTransactions();
    setCreateLoading(false);
  }

  async function runAction(id: string, action: "submit" | "post") {
    setStateLoading(true);
    setError(null);
    const response = await fetch(`/api/transactions/${id}/${action}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${action} transaction.`);
      setStateLoading(false);
      return;
    }
    await loadTransactions();
    setStateLoading(false);
  }

  async function reverse(id: string) {
    const reason = window.prompt("Reverse reason");
    if (!reason) {
      return;
    }

    setStateLoading(true);
    setError(null);
    const response = await fetch(`/api/transactions/${id}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to reverse transaction.");
      setStateLoading(false);
      return;
    }
    await loadTransactions();
    setStateLoading(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Transactions</p>
        <h1 className="ims-title">{headerTitle}</h1>
        <p className="ims-subtitle">{headerSubtitle}</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-[18rem]">
        <h2 className="text-lg font-semibold">{createTitle}</h2>
        <form onSubmit={createTransaction} className="mt-4 grid gap-3 md:grid-cols-5">
          <Select name="location_id" required className="ims-control-lg">
            <option value="">Location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>

          {mode === "adjustment" ? (
            <Select name="direction" required className="ims-control-lg">
              <option value="ADD">Add Stock</option>
              <option value="REMOVE">Remove Stock</option>
            </Select>
          ) : (
            <div className="ims-control-lg rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-muted)] px-[var(--space-4)] text-sm text-[var(--text-muted)]">
              Add Stock
            </div>
          )}

          <Select name="product_id" required className="ims-control-lg">
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </Select>

          <Input name="qty" required min={1} type="number" placeholder="Quantity" className="ims-control-lg" />
          <Input name="lot_number" placeholder="Lot number" className="ims-control-lg" />
          <Input name="expiry_date" type="date" className="ims-control-lg" />
          <Input
            name="unit_cost"
            type="number"
            step="0.01"
            min={0}
            placeholder="Unit cost"
            className="ims-control-lg"
          />
          <Input name="notes" placeholder="Notes" className="ims-control-lg md:col-span-3" />
          <Button type="submit" disabled={createLoading} className="ims-control-lg rounded-2xl">
            {createLoading ? "Saving..." : "Create Draft"}
          </Button>
        </form>
      </Card>

      <Card className="min-h-[24rem]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
            <MasterRowLimitControl
              value={historyRowLimit}
              onChange={(limit) => {
                setHistoryRowLimit(limit);
                setHistoryPage(1);
              }}
            />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{historyTitle}</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TransactionListSettingsMenu
              orderedColumns={orderedHistoryColumns}
              columnVisibility={historyColumnVisibility}
              onToggleColumn={toggleHistoryColumnVisibility}
              onMoveColumn={moveHistoryColumn}
              onResetColumns={resetHistoryColumnPreferences}
              exportTitle={historyTitle}
              exportFilenameBase={mode === "opening" ? "opening-stock-history" : "stock-adjustment-history"}
              exportColumns={ADJUSTMENT_EXPORT_COLUMNS}
              exportRows={historyExportRows}
              exportEmptyMessage="No adjustment history rows available."
            />
          </div>
        </div>
        <div className="mt-4 max-h-[32rem] overflow-auto">
          <table className="ims-table ims-master-table">
            <thead className="ims-table-head">
              <tr>
                {visibleHistoryColumns.map((column) => (
                  <th key={column.key} data-column-key={column.key}>
                    {column.key === "item"
                      ? summaryHistory
                        ? "Items"
                        : "Product"
                      : column.label}
                  </th>
                ))}
                <th data-column-key="action">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.items.map((tx) => {
                const line = tx.inventory_transaction_lines?.[0];
                const reason = line?.reason_code ?? "";
                const isDecrease = reason === "DECREASE";
                const locationId = isDecrease ? tx.source_location_id : tx.destination_location_id;
                const location = locationId ? locationById.get(locationId) : undefined;
                const modeLabel =
                  reason === "OPENING" ? "Opening" : isDecrease ? "Remove" : "Add";
                const detailHref = detailBasePath ? `${detailBasePath}/${tx.id}` : undefined;

                return (
                  <tr
                    key={tx.id}
                    className={`ims-table-row${detailHref ? " cursor-pointer" : ""}`}
                    onClick={detailHref ? () => router.push(detailHref) : undefined}
                    onKeyDown={
                      detailHref
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(detailHref);
                            }
                          }
                        : undefined
                    }
                    role={detailHref ? "link" : undefined}
                    tabIndex={detailHref ? 0 : undefined}
                  >
                    {visibleHistoryColumns.map((column) => (
                      <td key={column.key} data-column-key={column.key}>
                        {column.key === "number" ? (
                          detailHref ? (
                            <Link
                              href={detailHref}
                              className="font-medium underline-offset-4 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {tx.tx_number}
                            </Link>
                          ) : (
                            <span className="font-medium">{tx.tx_number}</span>
                          )
                        ) : null}
                        {column.key === "mode" ? modeLabel : null}
                        {column.key === "status" ? tx.status : null}
                        {column.key === "location"
                          ? location
                            ? `${location.code ?? "LOC"} - ${location.name}`
                            : "--"
                          : null}
                        {column.key === "item"
                          ? summaryHistory
                            ? `${getTransactionItemCount(tx)} item${getTransactionItemCount(tx) === 1 ? "" : "s"}`
                            : formatHistoricalProduct(line, productById)
                          : null}
                        {column.key === "qty"
                          ? summaryHistory
                            ? getTransactionTotalQty(tx)
                            : line?.qty ?? "--"
                          : null}
                        {column.key === "created"
                          ? new Date(tx.created_at).toLocaleString()
                          : null}
                      </td>
                    ))}
                    <td data-column-key="action">
                      <TransactionRowActionsMenu
                        actions={[
                          {
                            label: "Submit",
                            disabled: stateLoading || tx.status !== "DRAFT",
                            onSelect: () => runAction(tx.id, "submit"),
                          },
                          {
                            label: "Post",
                            disabled: stateLoading || tx.status !== "SUBMITTED",
                            onSelect: () => runAction(tx.id, "post"),
                          },
                          {
                            label: "Reverse",
                            disabled: stateLoading || tx.status !== "POSTED",
                            tone: "danger",
                            onSelect: () => reverse(tx.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {paginatedTransactions.totalItems === 0 ? (
            <p className="ims-empty mt-3">No records found.</p>
          ) : null}
        </div>
        <MasterTablePagination
          totalItems={paginatedTransactions.totalItems}
          currentPage={paginatedTransactions.currentPage}
          rowLimit={historyRowLimit}
          onPageChange={setHistoryPage}
        />
      </Card>
    </div>
  );
}
