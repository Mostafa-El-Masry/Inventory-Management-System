"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fetchJson } from "@/lib/utils/fetch-json";

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
  const [asOfDate, setAsOfDate] = useState("");

  async function loadStock(query = "", signal?: AbortSignal) {
    setLoading(true);
    try {
      const result = await fetchJson<{ items?: StockRow[]; error?: string }>(
        `/api/stock${query}`,
        {
          cache: "no-store",
          signal,
          fallbackError: "Failed to load stock.",
        },
      );
      if (!result.ok) {
        if (result.error !== "Request aborted.") {
          setError(result.error);
        }
        return;
      }

      setError(null);
      setRows(result.data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadLookups(signal?: AbortSignal) {
    const [productsResult, locationsResult] = await Promise.all([
      fetchJson<{ items?: Lookup[]; error?: string }>("/api/products", {
        signal,
        fallbackError: "Failed to load products.",
      }),
      fetchJson<{ items?: Lookup[]; error?: string }>("/api/locations", {
        signal,
        fallbackError: "Failed to load locations.",
      }),
    ]);

    if (!productsResult.ok) {
      if (productsResult.error !== "Request aborted.") {
        setError(productsResult.error);
      }
      return;
    }
    if (!locationsResult.ok) {
      if (locationsResult.error !== "Request aborted.") {
        setError(locationsResult.error);
      }
      return;
    }

    setProducts(productsResult.data.items ?? []);
    setLocations(locationsResult.data.items ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([loadStock("", controller.signal), loadLookups(controller.signal)]).catch(() => {
      setError("Failed to load inventory data.");
    });
    return () => controller.abort();
  }, []);

  async function filterStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const productId = String(formData.get("product_id") ?? "");
    const locationId = String(formData.get("location_id") ?? "");
    const asOfDateValue = String(formData.get("as_of_date") ?? "");
    if (productId) params.set("product_id", productId);
    if (locationId) params.set("location_id", locationId);
    if (asOfDateValue) params.set("as_of_date", asOfDateValue);
    setAsOfDate(asOfDateValue);
    const query = params.toString() ? `?${params.toString()}` : "";
    await loadStock(query);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Inventory</p>
        <h1 className="ims-title text-[2.1rem]">Inventory Stock</h1>
        <p className="ims-subtitle">
          Batch-level stock with lot, expiry date, and available quantity.
        </p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-36">
        <h2 className="text-lg font-semibold">Filters</h2>
        <form onSubmit={filterStock} className="mt-3 grid gap-3 md:grid-cols-4">
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

          <Input
            name="as_of_date"
            type="date"
            className="h-11"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
          />

          <Button type="submit" className="h-11 rounded-2xl">
            Apply Filter
          </Button>
        </form>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {asOfDate
            ? `Showing stock snapshot as of ${asOfDate}.`
            : "Leave date empty to show current stock."}
        </p>
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
