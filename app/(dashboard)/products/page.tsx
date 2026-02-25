"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  is_active: boolean;
};

type Location = {
  id: string;
  name: string;
  code: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);

  async function loadProducts() {
    const response = await fetch("/api/products", { cache: "no-store" });
    const json = (await response.json()) as { items?: Product[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load products.");
      return;
    }
    setProducts(json.items ?? []);
  }

  async function loadLocations() {
    const response = await fetch("/api/locations", { cache: "no-store" });
    const json = (await response.json()) as { items?: Location[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load locations.");
      return;
    }
    setLocations(json.items ?? []);
  }

  useEffect(() => {
    Promise.all([loadProducts(), loadLocations()]).catch(() => {
      setError("Failed to load product data.");
    });
  }, []);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      sku: String(formData.get("sku") ?? ""),
      name: String(formData.get("name") ?? ""),
      barcode: String(formData.get("barcode") ?? "") || null,
      unit: String(formData.get("unit") ?? "unit"),
      description: String(formData.get("description") ?? "") || null,
      is_active: true,
    };

    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create product.");
      setLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    await loadProducts();
    setLoading(false);
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPolicyLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const productId = String(formData.get("product_id") ?? "");
    const payload = {
      location_id: String(formData.get("location_id") ?? ""),
      min_qty: Number(formData.get("min_qty") ?? 0),
      max_qty: Number(formData.get("max_qty") ?? 0),
      reorder_qty: Number(formData.get("reorder_qty") ?? 0),
    };

    const response = await fetch(`/api/products/${productId}/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to save product policy.");
      setPolicyLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    setPolicyLoading(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-slate-600">
          Manage product master, barcode, and location reorder policies.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <h2 className="text-lg font-semibold">Add Product</h2>
          <form onSubmit={createProduct} className="mt-4 space-y-3">
            <input
              name="sku"
              required
              placeholder="SKU"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="name"
              required
              placeholder="Product name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="barcode"
              placeholder="Barcode"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="unit"
              defaultValue="unit"
              placeholder="Unit"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              placeholder="Description"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Create Product"}
            </Button>
          </form>
        </Card>

        <Card className="xl:col-span-2">
          <h2 className="text-lg font-semibold">Product List</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-4">SKU</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Barcode</th>
                  <th className="pb-2 pr-4">Unit</th>
                  <th className="pb-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-slate-200">
                    <td className="py-2 pr-4 font-medium">{product.sku}</td>
                    <td className="py-2 pr-4">{product.name}</td>
                    <td className="py-2 pr-4">{product.barcode ?? "-"}</td>
                    <td className="py-2 pr-4">{product.unit}</td>
                    <td className="py-2">{product.is_active ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No products created.</p>
            ) : null}
          </div>
        </Card>
      </section>

      <Card>
        <h2 className="text-lg font-semibold">Location Reorder Policy</h2>
        <form onSubmit={createPolicy} className="mt-4 grid gap-3 md:grid-cols-5">
          <select
            name="product_id"
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} - {product.name}
              </option>
            ))}
          </select>

          <select
            name="location_id"
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} - {location.name}
              </option>
            ))}
          </select>

          <input
            name="min_qty"
            required
            type="number"
            min={0}
            placeholder="Min qty"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="max_qty"
            required
            type="number"
            min={0}
            placeholder="Max qty"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              name="reorder_qty"
              required
              type="number"
              min={0}
              placeholder="Reorder qty"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={policyLoading}>
              Save
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
