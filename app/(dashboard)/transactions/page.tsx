"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-slate-600">
          Receive, issue, adjust, return, and cycle count inventory movements.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold">Create Transaction (single-line quick entry)</h2>
        <form onSubmit={createTransaction} className="mt-4 grid gap-3 md:grid-cols-4">
          <select
            name="type"
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
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
          </select>

          <select
            name="source_location_id"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Source location (optional)</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </select>

          <select
            name="destination_location_id"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Destination location (optional)</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </select>

          <select
            name="product_id"
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </select>

          <input
            name="qty"
            required
            min={1}
            type="number"
            placeholder="Quantity"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="lot_number"
            placeholder="Lot number"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="expiry_date"
            type="date"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="unit_cost"
            type="number"
            step="0.01"
            min={0}
            placeholder="Unit cost"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="notes"
            placeholder="Notes"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-3"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Create Draft"}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Transaction History</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 pr-3">Number</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Created</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-200">
                  <td className="py-2 pr-3 font-medium">{tx.tx_number}</td>
                  <td className="py-2 pr-3">{tx.type}</td>
                  <td className="py-2 pr-3">{tx.status}</td>
                  <td className="py-2 pr-3">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => runAction(tx.id, "submit")}
                        disabled={tx.status !== "DRAFT"}
                      >
                        Submit
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => runAction(tx.id, "post")}
                        disabled={tx.status !== "SUBMITTED"}
                      >
                        Post
                      </Button>
                      <Button
                        variant="danger"
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
            <p className="mt-3 text-sm text-slate-500">No transactions yet.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
