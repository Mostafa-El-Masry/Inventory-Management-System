"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

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
        <p className="ims-kicker">Inventory</p>
        <h1 className="ims-title text-[2.1rem]">Inventory Stock</h1>
        <p className="ims-subtitle">Batch-level stock with lot, expiry date, and available quantity.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-36">
        <h2 className="text-lg font-semibold">Filters</h2>
        <form onSubmit={filterStock} className="mt-3 grid gap-3 md:grid-cols-3">
          <Select name="product_id" className="h-11">
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {(product.sku ?? "SKU")} - {product.name}
              </option>
            ))}
          </Select>

          <Select name="location_id" className="h-11">
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {(location.code ?? "LOC")} - {location.name}
              </option>
            ))}
          </Select>

          <Button type="submit" className="h-11 rounded-2xl">
            Apply Filter
          </Button>
        </form>
      </Card>

      <Card className="min-h-[22rem]">
        <h2 className="text-lg font-semibold">
          Stock Batches {loading ? "(Loading...)" : ""}
        </h2>
        <div className="mt-4 max-h-[32rem] overflow-auto">
          <table className="ims-table">
            <thead className="ims-table-head">
              <tr>
                <th>Location</th>
                <th>Product</th>
                <th>Lot</th>
                <th>Expiry</th>
                <th>Qty</th>
                <th>Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="ims-table-row">
                  <td>{row.locations?.name ?? row.location_id}</td>
                  <td>{row.products?.name ?? row.product_id}</td>
                  <td>{row.lot_number ?? "-"}</td>
                  <td>{row.expiry_date ?? "-"}</td>
                  <td className="font-semibold">{row.qty_on_hand}</td>
                  <td>{row.unit_cost ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="ims-empty mt-3">No stock rows found.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
