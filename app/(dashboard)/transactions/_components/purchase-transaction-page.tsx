"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  type ReactNode,
  type SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { MAIN_WAREHOUSE_NAME } from "@/lib/locations/main-warehouse-constants";
import {
  formatSystemCurrency,
  type SystemCurrencyCode,
} from "@/lib/settings/system-currency";

import { fetchAllHistoryItems } from "./fetch-all-history-items";
import { TransactionListSettingsMenu } from "./transaction-list-settings-menu";
import { TransactionRowActionsMenu } from "./transaction-row-actions-menu";
import { useHistoryAutoRefresh } from "./use-history-auto-refresh";

type TxStatus = "DRAFT" | "SUBMITTED" | "POSTED" | "REVERSED" | "CANCELLED";
type PurchaseTransactionViewMode = "combined" | "history" | "create";
type PurchaseHeaderActionKind = "create" | "back";
type InventoryStatusAction = "post" | "unpost";

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
  type: "RECEIPT" | "RETURN_OUT";
  status: TxStatus;
  source_location_id: string | null;
  destination_location_id: string | null;
  supplier_id?: string | null;
  supplier_code_snapshot?: string | null;
  supplier_name_snapshot?: string | null;
  supplier_invoice_number?: string | null;
  supplier_invoice_date?: string | null;
  created_at: string;
  inventory_transaction_lines?: TxLine[];
};

type Lookup = {
  id: string;
  name: string;
  sku?: string;
  code?: string;
};

type PurchaseHeaderAction = {
  href: string;
  label: string;
  kind: PurchaseHeaderActionKind;
};

type PurchaseHistoryColumnKey =
  | "number"
  | "voucherDate"
  | "supplier"
  | "amount"
  | "status"
  | "location"
  | "item"
  | "qty"
  | "created";

const PURCHASE_HISTORY_SUMMARY_DEFAULT_COLUMN_ORDER: readonly PurchaseHistoryColumnKey[] = [
  "number",
  "supplier",
  "voucherDate",
  "amount",
  "status",
  "location",
  "item",
  "qty",
  "created",
];

const PURCHASE_HISTORY_SUMMARY_DEFAULT_COLUMN_VISIBILITY =
  buildDefaultColumnVisibility<PurchaseHistoryColumnKey>(
    PURCHASE_HISTORY_SUMMARY_DEFAULT_COLUMN_ORDER,
    ["number", "supplier", "voucherDate", "amount", "status"],
  );

const PURCHASE_HISTORY_DETAIL_DEFAULT_COLUMN_ORDER: readonly PurchaseHistoryColumnKey[] = [
  "number",
  "status",
  "location",
  "item",
  "qty",
  "created",
];

const PURCHASE_HISTORY_DETAIL_DEFAULT_COLUMN_VISIBILITY =
  buildDefaultColumnVisibility<PurchaseHistoryColumnKey>(
    PURCHASE_HISTORY_DETAIL_DEFAULT_COLUMN_ORDER,
  );

const PURCHASE_SUMMARY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "voucher_no", label: "Voucher No" },
  { key: "voucher_date", label: "Voucher Date" },
  { key: "supplier_name", label: "Supplier Name" },
  { key: "total_amount", label: "Total Amount" },
  { key: "status", label: "Status" },
  { key: "location", label: "Warehouse" },
  { key: "item_count", label: "Items" },
  { key: "total_qty", label: "Total Qty" },
  { key: "created_at", label: "Created" },
];

const PURCHASE_DETAIL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "number", label: "Number" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "product", label: "Product" },
  { key: "qty", label: "Qty" },
  { key: "created_at", label: "Created" },
];

type Props = {
  headerTitle: string;
  headerSubtitle: string;
  createTitle: string;
  historyTitle: string;
  transactionType: "RECEIPT" | "RETURN_OUT";
  locationLabel: string;
  locationTarget: "source" | "destination";
  viewMode?: PurchaseTransactionViewMode;
  headerAction?: PurchaseHeaderAction;
  successMessage?: string;
  detailBasePath?: string;
  summaryHistory?: boolean;
};

function SvgIcon({
  children,
  ...props
}: SVGProps<SVGSVGElement> & {
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgIcon {...props}>
      <path d="m15 6-6 6 6 6" />
      <path d="M9 12h10" />
    </SvgIcon>
  );
}

function HeaderActionLink({ action }: { action: PurchaseHeaderAction }) {
  const Icon = action.kind === "create" ? PlusIcon : ArrowLeftIcon;

  return (
    <Link
      href={action.href}
      aria-label={action.label}
      title={action.label}
      className="inline-flex ims-control-md w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
    >
      <Icon className="h-4.5 w-4.5" />
    </Link>
  );
}

function TransactionPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: PurchaseHeaderAction;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="ims-kicker">Transactions</p>
        <h1 className="ims-title">{title}</h1>
        <p className="ims-subtitle">{subtitle}</p>
      </div>
      {action ? <HeaderActionLink action={action} /> : null}
    </header>
  );
}

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

function getTransactionItemCount(transaction: Tx) {
  return transaction.inventory_transaction_lines?.length ?? 0;
}

function getTransactionTotalQty(transaction: Tx) {
  return (transaction.inventory_transaction_lines ?? []).reduce(
    (total, line) => total + Number(line.qty ?? 0),
    0,
  );
}

function getTransactionTotalAmount(transaction: Tx) {
  return (transaction.inventory_transaction_lines ?? []).reduce(
    (total, line) => total + Number(line.qty ?? 0) * Number(line.unit_cost ?? 0),
    0,
  );
}

function formatTransactionMoney(value: number) {
  return value.toFixed(2);
}

function formatSupplierName(transaction: Tx, supplierById: Map<string, Lookup>) {
  const snapshotName = transaction.supplier_name_snapshot?.trim();
  const snapshotCode = transaction.supplier_code_snapshot?.trim();
  if (snapshotName) {
    return snapshotCode ? `${snapshotCode} - ${snapshotName}` : snapshotName;
  }

  if (!transaction.supplier_id) {
    return "--";
  }

  const supplier = supplierById.get(transaction.supplier_id);
  if (!supplier) {
    return transaction.supplier_id;
  }

  return supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name;
}

function formatVoucherDate(transaction: Tx) {
  const rawDate = transaction.supplier_invoice_date ?? transaction.created_at;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return rawDate || "--";
  }

  return parsed.toLocaleDateString();
}

function PurchaseTransactionCreateSection({
  createTitle,
  suppliers,
  locations,
  products,
  createLoading,
  submitLabel,
  locationLabel,
  fixedLocationName,
  onSubmit,
}: {
  createTitle: string;
  suppliers: Lookup[];
  locations: Lookup[];
  products: Lookup[];
  createLoading: boolean;
  submitLabel: string;
  locationLabel: string;
  fixedLocationName?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <Card className="min-h-[18rem]">
      <h2 className="text-lg font-semibold">{createTitle}</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-6">
        <Select name="supplier_id" required className="ims-control-lg">
          <option value="">Select supplier</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {(supplier.code ?? "SUP")} - {supplier.name}
            </option>
          ))}
        </Select>

        <Input
          name="supplier_invoice_number"
          required
          placeholder="Supplier invoice number"
          className="ims-control-lg"
        />

        <Input
          name="supplier_invoice_date"
          type="date"
          required
          className="ims-control-lg"
          defaultValue={new Date().toISOString().slice(0, 10)}
        />

        {fixedLocationName ? (
          <div className="ims-control-lg flex items-center rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-muted)] px-4 text-sm text-[var(--text-strong)]">
            {locationLabel}: {fixedLocationName}
          </div>
        ) : (
          <Select name="location_id" required className="ims-control-lg">
            <option value="">{locationLabel}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>
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
        <Input name="notes" placeholder="Notes" className="ims-control-lg md:col-span-4" />
        <Button type="submit" disabled={createLoading} className="ims-control-lg rounded-2xl">
          {createLoading ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Card>
  );
}

function PurchaseTransactionHistorySection({
  historyTitle,
  transactions,
  locationTarget,
  locationById,
  productById,
  supplierById,
  currentPage,
  rowLimit,
  orderedColumns,
  visibleColumns,
  columnVisibility,
  stateLoading,
  detailBasePath,
  summaryHistory,
  exportColumns,
  exportRows,
  onPageChange,
  onRowLimitChange,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
  onRunAction,
  onReverse,
  canUnpost,
  currencyCode,
}: {
  historyTitle: string;
  transactions: Tx[];
  locationTarget: "source" | "destination";
  locationById: Map<string, Lookup>;
  productById: Map<string, Lookup>;
  supplierById: Map<string, Lookup>;
  currentPage: number;
  rowLimit: RowLimitOption;
  orderedColumns: readonly MasterColumnDefinition<PurchaseHistoryColumnKey>[];
  visibleColumns: readonly MasterColumnDefinition<PurchaseHistoryColumnKey>[];
  columnVisibility: Record<PurchaseHistoryColumnKey, boolean>;
  stateLoading: boolean;
  detailBasePath?: string;
  summaryHistory?: boolean;
  exportColumns: ExportColumn[];
  exportRows: Array<Record<string, unknown>>;
  onPageChange: (page: number) => void;
  onRowLimitChange: (limit: RowLimitOption) => void;
  onToggleColumn: (columnKey: PurchaseHistoryColumnKey) => void;
  onMoveColumn: (columnKey: PurchaseHistoryColumnKey, direction: -1 | 1) => void;
  onResetColumns: () => void;
  onRunAction: (id: string, action: InventoryStatusAction) => Promise<void>;
  onReverse: (id: string) => Promise<void>;
  canUnpost: boolean;
  currencyCode: SystemCurrencyCode;
}) {
  const router = useRouter();
  const tableWrapperClassName = summaryHistory
    ? "mt-4 max-h-[32rem] overflow-y-auto overflow-x-hidden"
    : "mt-4 max-h-[32rem] overflow-auto";
  const tableClassName = summaryHistory ? "ims-table w-full" : "ims-table ims-master-table";
  const pagination = useMemo(
    () => paginateRows(transactions, rowLimit, currentPage),
    [currentPage, rowLimit, transactions],
  );

  return (
    <Card className="min-h-[24rem]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
          <MasterRowLimitControl
            value={rowLimit}
            onChange={(limit) => {
              onRowLimitChange(limit);
              onPageChange(1);
            }}
          />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{historyTitle}</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TransactionListSettingsMenu
            orderedColumns={orderedColumns}
            columnVisibility={columnVisibility}
            onToggleColumn={onToggleColumn}
            onMoveColumn={onMoveColumn}
            onResetColumns={onResetColumns}
            exportTitle={historyTitle}
            exportFilenameBase={
              summaryHistory
                ? "purchase-history"
                : "purchase-transaction-history"
            }
            exportColumns={exportColumns}
            exportRows={exportRows}
            exportEmptyMessage="No purchase history rows available."
          />
        </div>
      </div>
      <div className={tableWrapperClassName}>
        <table className={tableClassName}>
          <thead className="ims-table-head">
            <tr>
              {visibleColumns.map((column) => (
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
            {pagination.items.map((tx) => {
              const line = tx.inventory_transaction_lines?.[0];
              const locationId =
                locationTarget === "destination"
                  ? tx.destination_location_id
                  : tx.source_location_id;
              const location = locationId ? locationById.get(locationId) : undefined;
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
                  {visibleColumns.map((column) => (
                    <td key={column.key} data-column-key={column.key}>
                      {column.key === "number" ? (
                        detailHref ? (
                          <Link
                            href={detailHref}
                            className="font-medium underline-offset-4 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {tx.supplier_invoice_number?.trim() || tx.tx_number}
                          </Link>
                        ) : (
                          <span className="font-medium">
                            {tx.supplier_invoice_number?.trim() || tx.tx_number}
                          </span>
                        )
                      ) : null}
                      {column.key === "voucherDate" ? formatVoucherDate(tx) : null}
                      {column.key === "supplier"
                        ? formatSupplierName(tx, supplierById)
                        : null}
                      {column.key === "amount"
                        ? formatSystemCurrency(
                            getTransactionTotalAmount(tx),
                            currencyCode,
                          )
                        : null}
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
                          label: "Post",
                          disabled: stateLoading || tx.status !== "DRAFT",
                          onSelect: () => onRunAction(tx.id, "post"),
                        },
                        ...(canUnpost
                          ? [
                              {
                                label: "Unpost",
                                disabled: stateLoading || tx.status !== "POSTED",
                                onSelect: () => onRunAction(tx.id, "unpost"),
                              },
                            ]
                          : []),
                        {
                          label: "Reverse",
                          disabled: stateLoading || tx.status !== "POSTED",
                          tone: "danger",
                          onSelect: () => onReverse(tx.id),
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pagination.totalItems === 0 ? (
          <p className="ims-empty mt-3">No records found.</p>
        ) : null}
      </div>
      <MasterTablePagination
        totalItems={pagination.totalItems}
        currentPage={pagination.currentPage}
        rowLimit={rowLimit}
        onPageChange={onPageChange}
      />
    </Card>
  );
}

export function PurchaseTransactionPage({
  headerTitle,
  headerSubtitle,
  createTitle,
  historyTitle,
  transactionType,
  locationLabel,
  locationTarget,
  viewMode = "combined",
  headerAction,
  successMessage,
  detailBasePath,
  summaryHistory = false,
}: Props) {
  const { userId: authUserId, role, currencyCode } = useDashboardSession();
  const canUnpost = role === "admin";
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [suppliers, setSuppliers] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyRowLimit, setHistoryRowLimit] = useState<RowLimitOption>(10);
  const historyDefaultOrder = useMemo(
    () =>
      summaryHistory
        ? PURCHASE_HISTORY_SUMMARY_DEFAULT_COLUMN_ORDER
        : PURCHASE_HISTORY_DETAIL_DEFAULT_COLUMN_ORDER,
    [summaryHistory],
  );
  const historyDefaultVisibility = useMemo(
    () =>
      summaryHistory
        ? PURCHASE_HISTORY_SUMMARY_DEFAULT_COLUMN_VISIBILITY
        : PURCHASE_HISTORY_DETAIL_DEFAULT_COLUMN_VISIBILITY,
    [summaryHistory],
  );
  const historyColumns = useMemo<readonly MasterColumnDefinition<PurchaseHistoryColumnKey>[]>(
    () => [
      { key: "number", label: "Voucher No" },
      { key: "voucherDate", label: "Voucher Date" },
      { key: "supplier", label: "Supplier Name" },
      { key: "amount", label: "Total Amount" },
      { key: "status", label: "Status" },
      {
        key: "location",
        label:
          summaryHistory && transactionType === "RECEIPT" ? "Warehouse" : "Location",
      },
      { key: "item", label: summaryHistory ? "Items" : "Product" },
      { key: "qty", label: "Qty" },
      { key: "created", label: "Created" },
    ],
    [summaryHistory, transactionType],
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
    storageKey: `ims:${transactionType.toLowerCase()}:history:columns:v4:${authUserId}`,
    columns: historyColumns,
    defaultOrder: historyDefaultOrder,
    defaultVisibility: historyDefaultVisibility,
  });

  const createSuccessMessage =
    successMessage ??
    (transactionType === "RETURN_OUT"
      ? "Purchase return saved. Stock updated immediately."
      : "Purchase saved. Stock and cost updated immediately.");
  const createSubmitLabel =
    transactionType === "RETURN_OUT" ? "Save Return" : "Save Purchase";
  const finalizedMessage =
    transactionType === "RETURN_OUT"
      ? "Purchase return finalized."
      : "Purchase finalized.";
  const reopenedMessage =
    transactionType === "RETURN_OUT"
      ? "Purchase return reopened. Stock remains applied."
      : "Purchase reopened. Stock and cost remain applied.";
  const showCreateSection = viewMode !== "history";
  const showHistorySection = viewMode !== "create";
  const fixedLocationName =
    transactionType === "RECEIPT" ? MAIN_WAREHOUSE_NAME : null;

  const loadTransactions = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchAllHistoryItems<Tx>(`/api/transactions?type=${transactionType}`, {
      signal,
      fallbackError: "Failed to load transactions.",
    });

    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }

    setTransactions(result.data);
  }, [transactionType]);

  const loadLookups = useCallback(async () => {
    const [productsRes, locationsRes, suppliersRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/locations"),
      fetch("/api/suppliers"),
    ]);
    const productsJson = (await productsRes.json()) as { items?: Lookup[]; error?: string };
    const locationsJson = (await locationsRes.json()) as {
      items?: Lookup[];
      error?: string;
    };
    const suppliersJson = (await suppliersRes.json()) as {
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
    if (!suppliersRes.ok) {
      setError(suppliersJson.error ?? "Failed to load suppliers.");
      return;
    }
    setProducts(productsJson.items ?? []);
    setLocations(locationsJson.items ?? []);
    setSuppliers(suppliersJson.items ?? []);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([loadTransactions(controller.signal), loadLookups()]).catch(() =>
      setError("Failed to load page data."),
    );
    return () => controller.abort();
  }, [loadLookups, loadTransactions]);

  useHistoryAutoRefresh(() => loadTransactions(), {
    enabled: showHistorySection,
  });

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

  const supplierById = useMemo(() => {
    const mapped = new Map<string, Lookup>();
    for (const supplier of suppliers) {
      mapped.set(supplier.id, supplier);
    }
    return mapped;
  }, [suppliers]);

  const historyExportColumns = useMemo(
    () =>
      summaryHistory
        ? PURCHASE_SUMMARY_EXPORT_COLUMNS.map((column) =>
            column.key === "location" && transactionType !== "RECEIPT"
              ? { ...column, label: "Location" }
              : column,
          )
        : PURCHASE_DETAIL_EXPORT_COLUMNS,
    [summaryHistory, transactionType],
  );

  const historyExportRows = useMemo(
    () =>
      transactions.map((transaction) => {
        const line = transaction.inventory_transaction_lines?.[0];
        const locationId =
          locationTarget === "destination"
            ? transaction.destination_location_id
            : transaction.source_location_id;
        const location = locationId ? locationById.get(locationId) : undefined;

        if (summaryHistory) {
          return {
            voucher_no: transaction.supplier_invoice_number?.trim() || transaction.tx_number,
            voucher_date: formatVoucherDate(transaction),
            supplier_name: formatSupplierName(transaction, supplierById),
            total_amount: formatTransactionMoney(getTransactionTotalAmount(transaction)),
            status: transaction.status,
            location: location
              ? `${location.code ?? "LOC"} - ${location.name}`
              : "--",
            item_count: getTransactionItemCount(transaction),
            total_qty: getTransactionTotalQty(transaction),
            created_at: new Date(transaction.created_at).toLocaleString(),
          };
        }

        return {
          number: transaction.tx_number,
          status: transaction.status,
          location: location ? `${location.code ?? "LOC"} - ${location.name}` : "--",
          product: formatHistoricalProduct(line, productById),
          qty: line?.qty ?? "--",
          created_at: new Date(transaction.created_at).toLocaleString(),
        };
      }),
    [
      locationById,
      locationTarget,
      productById,
      supplierById,
      summaryHistory,
      transactions,
    ],
  );

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateLoading(true);
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const locationId = String(formData.get("location_id") ?? "");
    const payload = {
      type: transactionType,
      source_location_id: locationTarget === "source" ? locationId : null,
      destination_location_id: locationTarget === "destination" ? locationId : null,
      supplier_id: String(formData.get("supplier_id") ?? "") || null,
      supplier_invoice_number:
        String(formData.get("supplier_invoice_number") ?? "").trim() || null,
      supplier_invoice_date: String(formData.get("supplier_invoice_date") ?? "") || null,
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
      setError(json.error ?? "Failed to create transaction.");
      setCreateLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    setMessage(createSuccessMessage);
    await Promise.all([loadTransactions(), loadLookups()]);
    setCreateLoading(false);
  }

  async function runAction(id: string, action: InventoryStatusAction) {
    setStateLoading(true);
    setError(null);
    setMessage(null);
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
    setMessage(action === "post" ? finalizedMessage : reopenedMessage);
    setStateLoading(false);
  }

  async function reverse(id: string) {
    const reason = window.prompt("Reverse reason");
    if (!reason) {
      return;
    }

    setStateLoading(true);
    setError(null);
    setMessage(null);
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
      <TransactionPageHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        action={headerAction}
      />

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {showCreateSection ? (
        <PurchaseTransactionCreateSection
          createTitle={createTitle}
          suppliers={suppliers}
          locations={locations}
          products={products}
          createLoading={createLoading}
          submitLabel={createSubmitLabel}
          locationLabel={locationLabel}
          fixedLocationName={fixedLocationName}
          onSubmit={createTransaction}
        />
      ) : null}

      {showHistorySection ? (
        <PurchaseTransactionHistorySection
          historyTitle={historyTitle}
          transactions={transactions}
          locationTarget={locationTarget}
          locationById={locationById}
          productById={productById}
          supplierById={supplierById}
          currentPage={historyPage}
          rowLimit={historyRowLimit}
          orderedColumns={orderedHistoryColumns}
          visibleColumns={visibleHistoryColumns}
          columnVisibility={historyColumnVisibility}
          stateLoading={stateLoading}
          detailBasePath={detailBasePath}
          summaryHistory={summaryHistory}
          exportColumns={historyExportColumns}
          exportRows={historyExportRows}
          onPageChange={setHistoryPage}
          onRowLimitChange={setHistoryRowLimit}
          onToggleColumn={toggleHistoryColumnVisibility}
          onMoveColumn={moveHistoryColumn}
          onResetColumns={resetHistoryColumnPreferences}
          onRunAction={runAction}
          onReverse={reverse}
          canUnpost={canUnpost}
          currencyCode={currencyCode}
        />
      ) : null}
    </div>
  );
}
