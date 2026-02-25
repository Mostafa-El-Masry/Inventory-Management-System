"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Transfer = {
  id: string;
  transfer_number: string;
  status: string;
  from_location_id: string;
  to_location_id: string;
  created_at: string;
};

type Lookup = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadTransfers() {
    const response = await fetch("/api/transfers?limit=100", { cache: "no-store" });
    const json = (await response.json()) as { items?: Transfer[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load transfers.");
      return;
    }
    setTransfers(json.items ?? []);
  }

  async function loadLookups() {
    const [locationsRes, productsRes] = await Promise.all([
      fetch("/api/locations"),
      fetch("/api/products"),
    ]);
    const locationsJson = (await locationsRes.json()) as { items?: Lookup[] };
    const productsJson = (await productsRes.json()) as { items?: Lookup[] };
    setLocations(locationsJson.items ?? []);
    setProducts(productsJson.items ?? []);
  }

  useEffect(() => {
    Promise.all([loadTransfers(), loadLookups()]).catch(() =>
      setError("Failed to load transfer data."),
    );
  }, []);

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      from_location_id: String(formData.get("from_location_id") ?? ""),
      to_location_id: String(formData.get("to_location_id") ?? ""),
      notes: String(formData.get("notes") ?? "") || null,
      lines: [
        {
          product_id: String(formData.get("product_id") ?? ""),
          requested_qty: Number(formData.get("requested_qty") ?? 0),
        },
      ],
    };

    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create transfer.");
      setLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    await loadTransfers();
    setLoading(false);
  }

  async function transferAction(id: string, action: "approve" | "dispatch" | "receive") {
    setError(null);
    const response = await fetch(`/api/transfers/${id}/${action}`, { method: "POST" });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${action} transfer.`);
      return;
    }
    await loadTransfers();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Transfers</h1>
        <p className="text-sm text-slate-600">
          Manager-approved inter-location transfer lifecycle.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <Card className="min-h-[18rem]">
        <h2 className="text-lg font-semibold">Create Transfer Request</h2>
        <form onSubmit={createTransfer} className="mt-4 grid gap-3 md:grid-cols-5">
          <select
            name="from_location_id"
            required
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">From location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </select>
          <select
            name="to_location_id"
            required
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">To location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </select>
          <select
            name="product_id"
            required
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">Product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </select>
          <input
            name="requested_qty"
            type="number"
            min={1}
            required
            placeholder="Qty"
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          />
          <Button type="submit" disabled={loading} className="h-11">
            {loading ? "Saving..." : "Create Request"}
          </Button>
          <input
            name="notes"
            placeholder="Notes"
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm md:col-span-5"
          />
        </form>
      </Card>

      <Card className="min-h-[24rem]">
        <h2 className="text-lg font-semibold">Transfer History</h2>
        <div className="mt-4 max-h-[32rem] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-slate-500">
                <th className="pb-2 pr-3">Number</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">From</th>
                <th className="pb-2 pr-3">To</th>
                <th className="pb-2 pr-3">Created</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id} className="border-t border-slate-200">
                  <td className="py-2 pr-3 font-medium">{transfer.transfer_number}</td>
                  <td className="py-2 pr-3">{transfer.status}</td>
                  <td className="py-2 pr-3">{transfer.from_location_id}</td>
                  <td className="py-2 pr-3">{transfer.to_location_id}</td>
                  <td className="py-2 pr-3">
                    {new Date(transfer.created_at).toLocaleString()}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        disabled={transfer.status !== "REQUESTED"}
                        onClick={() => transferAction(transfer.id, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={transfer.status !== "APPROVED"}
                        onClick={() => transferAction(transfer.id, "dispatch")}
                      >
                        Dispatch
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={transfer.status !== "DISPATCHED"}
                        onClick={() => transferAction(transfer.id, "receive")}
                      >
                        Receive
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transfers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No transfers found.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
