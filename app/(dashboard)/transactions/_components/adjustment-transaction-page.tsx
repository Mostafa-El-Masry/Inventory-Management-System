"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type TxLine = {
  id: string;
  product_id: string;
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
  barcode?: string | null;
};

type Mode = "opening" | "adjustment";

type Props = {
  mode: Mode;
  headerTitle: string;
  headerSubtitle: string;
  createTitle: string;
  historyTitle: string;
};

export function AdjustmentTransactionPage({
  mode,
  headerTitle,
  headerSubtitle,
  createTitle,
  historyTitle,
}: Props) {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printLabels, setPrintLabels] = useState<BarcodeLabel[]>([]);
  const [printTitle, setPrintTitle] = useState("Barcode Labels");

  const loadTransactions = useCallback(async () => {
    const response = await fetch("/api/transactions?type=ADJUSTMENT&limit=200", {
      cache: "no-store",
    });
    const json = (await response.json()) as { items?: Tx[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load adjustments.");
      return;
    }
    setTransactions(json.items ?? []);
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const reason = tx.inventory_transaction_lines?.[0]?.reason_code ?? null;
      if (mode === "opening") {
        return reason === "OPENING";
      }
      return reason !== "OPENING";
    });
  }, [mode, transactions]);

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

  function openPrintForTransaction(tx: Tx) {
    const lines = tx.inventory_transaction_lines ?? [];
    const prepared = buildBarcodeLabelsFromLines(
      lines.map((line) => ({ productId: line.product_id })),
      productById,
    );
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }

    setError(null);
    setPrintLabels(prepared.labels);
    setPrintTitle(`${historyTitle} - ${tx.tx_number}`);
    setPrintDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Transactions</p>
        <h1 className="ims-title text-[2.1rem]">{headerTitle}</h1>
        <p className="ims-subtitle">{headerSubtitle}</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-[18rem]">
        <h2 className="text-lg font-semibold">{createTitle}</h2>
        <form onSubmit={createTransaction} className="mt-4 grid gap-3 md:grid-cols-5">
          <Select name="location_id" required className="h-11">
            <option value="">Location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>

          {mode === "adjustment" ? (
            <Select name="direction" required className="h-11">
              <option value="ADD">Add Stock</option>
              <option value="REMOVE">Remove Stock</option>
            </Select>
          ) : (
            <div className="h-11 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-muted)] px-[var(--space-4)] text-sm text-[var(--text-muted)]">
              Add Stock
            </div>
          )}

          <Select name="product_id" required className="h-11">
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </Select>

          <Input name="qty" required min={1} type="number" placeholder="Quantity" className="h-11" />
          <Input name="lot_number" placeholder="Lot number" className="h-11" />
          <Input name="expiry_date" type="date" className="h-11" />
          <Input
            name="unit_cost"
            type="number"
            step="0.01"
            min={0}
            placeholder="Unit cost"
            className="h-11"
          />
          <Input name="notes" placeholder="Notes" className="h-11 md:col-span-3" />
          <Button type="submit" disabled={createLoading} className="h-11 rounded-2xl">
            {createLoading ? "Saving..." : "Create Draft"}
          </Button>
        </form>
      </Card>

      <Card className="min-h-[24rem]">
        <h2 className="text-lg font-semibold">{historyTitle}</h2>
        <div className="mt-4 max-h-[32rem] overflow-auto">
          <table className="ims-table">
            <thead className="ims-table-head">
              <tr>
                <th>Number</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Location</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => {
                const line = tx.inventory_transaction_lines?.[0];
                const reason = line?.reason_code ?? "";
                const isDecrease = reason === "DECREASE";
                const locationId = isDecrease ? tx.source_location_id : tx.destination_location_id;
                const location = locationId ? locationById.get(locationId) : undefined;
                const product = line ? productById.get(line.product_id) : undefined;
                const modeLabel =
                  reason === "OPENING" ? "Opening" : isDecrease ? "Remove" : "Add";

                return (
                  <tr key={tx.id} className="ims-table-row">
                    <td className="font-medium">{tx.tx_number}</td>
                    <td>{modeLabel}</td>
                    <td>{tx.status}</td>
                    <td>{location ? `${location.code ?? "LOC"} - ${location.name}` : "--"}</td>
                    <td>{product ? `${product.sku ?? "SKU"} - ${product.name}` : "--"}</td>
                    <td>{line?.qty ?? "--"}</td>
                    <td>{new Date(tx.created_at).toLocaleString()}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          className="h-9"
                          onClick={() => runAction(tx.id, "submit")}
                          disabled={stateLoading || tx.status !== "DRAFT"}
                        >
                          Submit
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-9"
                          onClick={() => runAction(tx.id, "post")}
                          disabled={stateLoading || tx.status !== "SUBMITTED"}
                        >
                          Post
                        </Button>
                        <Button
                          variant="danger"
                          className="h-9"
                          onClick={() => reverse(tx.id)}
                          disabled={stateLoading || tx.status !== "POSTED"}
                        >
                          Reverse
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-9"
                          onClick={() => openPrintForTransaction(tx)}
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
          {filteredTransactions.length === 0 ? (
            <p className="ims-empty mt-3">No records found.</p>
          ) : null}
        </div>
      </Card>

      <BarcodePrintDialog
        open={printDialogOpen}
        onClose={() => setPrintDialogOpen(false)}
        onConfirm={({ format, quantity }) => {
          const result = printBarcodeLabels(printLabels, {
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
