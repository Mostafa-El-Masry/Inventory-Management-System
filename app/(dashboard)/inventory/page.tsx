"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type StockRow = {
  id: string;
  product_id: string;
  location_id: string;
  lot_number: string | null;
  expiry_date: string | null;
  qty_on_hand: number;
  unit_cost: number | null;
  products?: { name: string; sku: string } | null;
  locations?: { name: string; code: string } | null;
};

type Lookup = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
};

export default function InventoryPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadStock(query = "") {
    setLoading(true);
    const response = await fetch(`/api/stock${query}`, { cache: "no-store" });
    const json = (await response.json()) as { items?: StockRow[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load stock.");
      setLoading(false);
      return;
    }
    setRows(json.items ?? []);
    setLoading(false);
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
    Promise.all([loadStock(), loadLookups()]).catch(() => {
      setError("Failed to load inventory data.");
    });
  }, []);

  async function filterStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const productId = String(formData.get("product_id") ?? "");
    const locationId = String(formData.get("location_id") ?? "");
    if (productId) params.set("product_id", productId);
    if (locationId) params.set("location_id", locationId);
    const query = params.toString() ? `?${params.toString()}` : "";
    await loadStock(query);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-slate-600">
          Batch-level stock with lot, expiry date, and available quantity.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold">Filters</h2>
        <form onSubmit={filterStock} className="mt-3 grid gap-3 md:grid-cols-3">
          <select
            name="product_id"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </select>

          <select
            name="location_id"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </select>

          <Button type="submit">Apply Filter</Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">
          Stock Batches {loading ? "(Loading...)" : ""}
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 pr-3">Location</th>
                <th className="pb-2 pr-3">Product</th>
                <th className="pb-2 pr-3">Lot</th>
                <th className="pb-2 pr-3">Expiry</th>
                <th className="pb-2 pr-3">Qty</th>
                <th className="pb-2">Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-200">
                  <td className="py-2 pr-3">{row.locations?.name ?? row.location_id}</td>
                  <td className="py-2 pr-3">{row.products?.name ?? row.product_id}</td>
                  <td className="py-2 pr-3">{row.lot_number ?? "-"}</td>
                  <td className="py-2 pr-3">{row.expiry_date ?? "-"}</td>
                  <td className="py-2 pr-3 font-semibold">{row.qty_on_hand}</td>
                  <td className="py-2">{row.unit_cost ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No stock rows found.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
