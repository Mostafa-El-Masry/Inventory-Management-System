"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import {
  FormEvent,
  type ReactNode,
  type SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BarcodePrintDialog } from "./barcode-print-dialog";
import {
  BarcodeLabel,
  buildBarcodeLabelsFromLines,
  printBarcodeLabels,
} from "./barcode-print";

type TxStatus = "DRAFT" | "SUBMITTED" | "POSTED" | "REVERSED" | "CANCELLED";
type PurchaseTransactionViewMode = "combined" | "history" | "create";
type PurchaseHeaderActionKind = "create" | "back";

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
  created_at: string;
  inventory_transaction_lines?: TxLine[];
};

type Lookup = {
  id: string;
  name: string;
  sku?: string;
  code?: string;
  barcode?: string | null;
};

type PurchaseHeaderAction = {
  href: string;
  label: string;
  kind: PurchaseHeaderActionKind;
};

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

function PurchaseTransactionCreateSection({
  createTitle,
  suppliers,
  locations,
  products,
  createLoading,
  locationLabel,
  onSubmit,
}: {
  createTitle: string;
  suppliers: Lookup[];
  locations: Lookup[];
  products: Lookup[];
  createLoading: boolean;
  locationLabel: string;
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

        <Select name="location_id" required className="ims-control-lg">
          <option value="">{locationLabel}</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {(location.code ?? "LOC")} - {location.name}
            </option>
          ))}
        </Select>

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
          {createLoading ? "Saving..." : "Create Draft"}
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
  stateLoading,
  onRunAction,
  onReverse,
  onPrint,
}: {
  historyTitle: string;
  transactions: Tx[];
  locationTarget: "source" | "destination";
  locationById: Map<string, Lookup>;
  productById: Map<string, Lookup>;
  stateLoading: boolean;
  onRunAction: (id: string, action: "submit" | "post") => Promise<void>;
  onReverse: (id: string) => Promise<void>;
  onPrint: (tx: Tx, historyTitle: string) => void;
}) {
  return (
    <Card className="min-h-[24rem]">
      <h2 className="text-lg font-semibold">{historyTitle}</h2>
      <div className="mt-4 max-h-[32rem] overflow-auto">
        <table className="ims-table">
          <thead className="ims-table-head">
            <tr>
              <th>Number</th>
              <th>Status</th>
              <th>Location</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const line = tx.inventory_transaction_lines?.[0];
              const locationId =
                locationTarget === "destination"
                  ? tx.destination_location_id
                  : tx.source_location_id;
              const location = locationId ? locationById.get(locationId) : undefined;

              return (
                <tr key={tx.id} className="ims-table-row">
                  <td className="font-medium">{tx.tx_number}</td>
                  <td>{tx.status}</td>
                  <td>{location ? `${location.code ?? "LOC"} - ${location.name}` : "--"}</td>
                  <td>{formatHistoricalProduct(line, productById)}</td>
                  <td>{line?.qty ?? "--"}</td>
                  <td>{new Date(tx.created_at).toLocaleString()}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="ims-control-sm"
                        onClick={() => onRunAction(tx.id, "submit")}
                        disabled={stateLoading || tx.status !== "DRAFT"}
                      >
                        Submit
                      </Button>
                      <Button
                        variant="secondary"
                        className="ims-control-sm"
                        onClick={() => onRunAction(tx.id, "post")}
                        disabled={stateLoading || tx.status !== "SUBMITTED"}
                      >
                        Post
                      </Button>
                      <Button
                        variant="danger"
                        className="ims-control-sm"
                        onClick={() => onReverse(tx.id)}
                        disabled={stateLoading || tx.status !== "POSTED"}
                      >
                        Reverse
                      </Button>
                      <Button
                        variant="secondary"
                        className="ims-control-sm"
                        onClick={() => onPrint(tx, historyTitle)}
                      >
                        Print Barcode
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {transactions.length === 0 ? (
          <p className="ims-empty mt-3">No records found.</p>
        ) : null}
      </div>
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
}: Props) {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [suppliers, setSuppliers] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printLabels, setPrintLabels] = useState<BarcodeLabel[]>([]);
  const [printTitle, setPrintTitle] = useState("Barcode Labels");

  const createSuccessMessage =
    successMessage ??
    (transactionType === "RETURN_OUT"
      ? "Purchase return draft created."
      : "Purchase draft created.");
  const showCreateSection = viewMode !== "history";
  const showHistorySection = viewMode !== "create";

  const loadTransactions = useCallback(async () => {
    const response = await fetch(`/api/transactions?type=${transactionType}&limit=100`, {
      cache: "no-store",
    });
    const json = (await response.json()) as { items?: Tx[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load transactions.");
      return;
    }
    setTransactions(json.items ?? []);
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
    Promise.all([loadTransactions(), loadLookups()]).catch(() =>
      setError("Failed to load page data."),
    );
  }, [loadLookups, loadTransactions]);

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
    await loadTransactions();
    setCreateLoading(false);
  }

  async function runAction(id: string, action: "submit" | "post") {
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

  function openPrintForTransaction(tx: Tx, title: string) {
    const lines = tx.inventory_transaction_lines ?? [];
    const prepared = buildBarcodeLabelsFromLines(
      lines.map((line) => ({
        productId: line.product_id,
        productName: line.product_name_snapshot,
        productSku: line.product_sku_snapshot,
        productBarcode: line.product_barcode_snapshot,
        useSnapshot: hasHistoricalProductSnapshot(line),
      })),
      productById,
    );
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }

    setError(null);
    setPrintLabels(prepared.labels);
    setPrintTitle(`${title} - ${tx.tx_number}`);
    setPrintDialogOpen(true);
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
          locationLabel={locationLabel}
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
          stateLoading={stateLoading}
          onRunAction={runAction}
          onReverse={reverse}
          onPrint={openPrintForTransaction}
        />
      ) : null}

      <BarcodePrintDialog
        open={printDialogOpen}
        onClose={() => setPrintDialogOpen(false)}
        onConfirm={async ({ format, quantity }) => {
          const result = await printBarcodeLabels(printLabels, {
            format,
            quantity,
            title: printTitle,
          });
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setPrintDialogOpen(false);
        }}
      />
    </div>
  );
}
