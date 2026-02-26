"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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
        <p className="ims-kicker">Transfers</p>
        <h1 className="ims-title text-[2.1rem]">Transfers</h1>
        <p className="ims-subtitle">Manager-approved inter-location transfer lifecycle.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-[18rem]">
        <h2 className="text-lg font-semibold">Create Transfer Request</h2>
        <form onSubmit={createTransfer} className="mt-4 grid gap-3 md:grid-cols-5">
          <Select name="from_location_id" required className="h-11">
            <option value="">From location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>
          <Select name="to_location_id" required className="h-11">
            <option value="">To location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>
          <Select name="product_id" required className="h-11">
            <option value="">Product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </Select>
          <Input
            name="requested_qty"
            type="number"
            min={1}
            required
            placeholder="Qty"
            className="h-11"
          />
          <Button type="submit" disabled={loading} className="h-11 rounded-2xl">
            {loading ? "Saving..." : "Create Request"}
          </Button>
          <Input
            name="notes"
            placeholder="Notes"
            className="h-11 md:col-span-5"
          />
        </form>
      </Card>

      <Card className="min-h-[24rem]">
        <h2 className="text-lg font-semibold">Transfer History</h2>
        <div className="mt-4 max-h-[32rem] overflow-auto">
          <table className="ims-table">
            <thead className="ims-table-head">
              <tr>
                <th>Number</th>
                <th>Status</th>
                <th>From</th>
                <th>To</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id} className="ims-table-row">
                  <td className="font-medium">{transfer.transfer_number}</td>
                  <td>{transfer.status}</td>
                  <td>{transfer.from_location_id}</td>
                  <td>{transfer.to_location_id}</td>
                  <td>{new Date(transfer.created_at).toLocaleString()}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="h-9"
                        disabled={transfer.status !== "REQUESTED"}
                        onClick={() => transferAction(transfer.id, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-9"
                        disabled={transfer.status !== "APPROVED"}
                        onClick={() => transferAction(transfer.id, "dispatch")}
                      >
                        Dispatch
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-9"
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
            <p className="ims-empty mt-3">No transfers found.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
