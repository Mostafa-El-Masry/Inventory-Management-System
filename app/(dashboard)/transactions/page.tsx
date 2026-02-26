"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Tx = {
  id: string;
  tx_number: string;
  type: string;
  status: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  created_at: string;
};

type Lookup = {
  id: string;
  name: string;
  sku?: string;
  code?: string;
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadTransactions() {
    const response = await fetch("/api/transactions?limit=100", { cache: "no-store" });
    const json = (await response.json()) as { items?: Tx[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load transactions.");
      return;
    }
    setTransactions(json.items ?? []);
  }

  async function loadLookups() {
    const [productsRes, locationsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/locations"),
    ]);
    const productsJson = (await productsRes.json()) as { items?: Lookup[] };
    const locationsJson = (await locationsRes.json()) as { items?: Lookup[] };
    setProducts(productsJson.items ?? []);
    setLocations(locationsJson.items ?? []);
  }

  useEffect(() => {
    Promise.all([loadTransactions(), loadLookups()]).catch(() =>
      setError("Failed to load transaction data."),
    );
  }, []);

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      type: String(formData.get("type") ?? "RECEIPT"),
      source_location_id: String(formData.get("source_location_id") ?? "") || null,
      destination_location_id:
        String(formData.get("destination_location_id") ?? "") || null,
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
      setLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    await loadTransactions();
    setLoading(false);
  }

  async function runAction(id: string, action: "submit" | "post") {
    setError(null);
    const response = await fetch(`/api/transactions/${id}/${action}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${action} transaction.`);
      return;
    }
    await loadTransactions();
  }

  async function reverse(id: string) {
    const reason = window.prompt("Reverse reason");
    if (!reason) {
      return;
    }

    setError(null);
    const response = await fetch(`/api/transactions/${id}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to reverse transaction.");
      return;
    }
    await loadTransactions();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Transactions</p>
        <h1 className="ims-title text-[2.1rem]">Transactions</h1>
        <p className="ims-subtitle">Receive, issue, adjust, return, and cycle count inventory movements.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-[18rem]">
        <h2 className="text-lg font-semibold">Create Transaction (single-line quick entry)</h2>
        <form onSubmit={createTransaction} className="mt-4 grid gap-3 md:grid-cols-4">
          <Select name="type" required className="h-11">
            {[
              "RECEIPT",
              "ISSUE",
              "ADJUSTMENT",
              "RETURN_IN",
              "RETURN_OUT",
              "CYCLE_COUNT",
            ].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>

          <Select name="source_location_id" className="h-11">
            <option value="">Source location (optional)</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>

          <Select name="destination_location_id" className="h-11">
            <option value="">Destination location (optional)</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>

          <Select name="product_id" required className="h-11">
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </Select>

          <Input
            name="qty"
            required
            min={1}
            type="number"
            placeholder="Quantity"
            className="h-11"
          />
          <Input
            name="lot_number"
            placeholder="Lot number"
            className="h-11"
          />
          <Input
            name="expiry_date"
            type="date"
            className="h-11"
          />
          <Input
            name="unit_cost"
            type="number"
            step="0.01"
            min={0}
            placeholder="Unit cost"
            className="h-11"
          />
          <Input
            name="notes"
            placeholder="Notes"
            className="h-11 md:col-span-3"
          />
          <Button type="submit" disabled={loading} className="h-11 rounded-2xl">
            {loading ? "Saving..." : "Create Draft"}
          </Button>
        </form>
      </Card>

      <Card className="min-h-[24rem]">
        <h2 className="text-lg font-semibold">Transaction History</h2>
        <div className="mt-4 max-h-[32rem] overflow-auto">
          <table className="ims-table">
            <thead className="ims-table-head">
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="ims-table-row">
                  <td className="font-medium">{tx.tx_number}</td>
                  <td>{tx.type}</td>
                  <td>{tx.status}</td>
                  <td>{new Date(tx.created_at).toLocaleString()}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="h-9"
                        onClick={() => runAction(tx.id, "submit")}
                        disabled={tx.status !== "DRAFT"}
                      >
                        Submit
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-9"
                        onClick={() => runAction(tx.id, "post")}
                        disabled={tx.status !== "SUBMITTED"}
                      >
                        Post
                      </Button>
                      <Button
                        variant="danger"
                        className="h-9"
                        onClick={() => reverse(tx.id)}
                        disabled={tx.status !== "POSTED"}
                      >
                        Reverse
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 ? (
            <p className="ims-empty mt-3">No transactions yet.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
