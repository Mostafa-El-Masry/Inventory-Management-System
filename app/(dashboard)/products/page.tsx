"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";

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
  is_active: boolean;
};

type AuthMe = {
  capabilities: {
    canCreateProductMaster: boolean;
    canEditProductMaster: boolean;
    canArchiveProducts: boolean;
    canEditProductPolicies: boolean;
  };
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [capabilities, setCapabilities] = useState<AuthMe["capabilities"] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    const response = await fetch(
      `/api/products?include_inactive=${showInactive ? "true" : "false"}`,
      { cache: "no-store" },
    );
    const json = (await response.json()) as { items?: Product[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load products.");
      return;
    }
    setProducts(json.items ?? []);
  }, [showInactive]);

  const loadLocations = useCallback(async () => {
    const response = await fetch("/api/locations?include_inactive=true", {
      cache: "no-store",
    });
    const json = (await response.json()) as { items?: Location[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load locations.");
      return;
    }
    setLocations(json.items ?? []);
  }, []);

  const loadAuth = useCallback(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const json = (await response.json()) as AuthMe & { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load permissions.");
      return;
    }
    setCapabilities(json.capabilities);
  }, []);

  useEffect(() => {
    Promise.all([loadAuth(), loadLocations()]).catch(() =>
      setError("Failed to load product data."),
    );
  }, [loadAuth, loadLocations]);

  useEffect(() => {
    loadProducts().catch(() => setError("Failed to load products."));
  }, [loadProducts]);

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

    event.currentTarget.reset();
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

    event.currentTarget.reset();
    setPolicyLoading(false);
  }

  async function setProductActive(productId: string, active: boolean) {
    setStateLoading(true);
    setError(null);
    const endpoint = active ? "activate" : "archive";
    const response = await fetch(`/api/products/${productId}/${endpoint}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${endpoint} product.`);
      setStateLoading(false);
      return;
    }

    await loadProducts();
    setStateLoading(false);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-slate-600">
          Product master is admin-managed. Managers can maintain location-level
          reorder policies.
        </p>
      </header>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-700">{error}</Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1 min-h-[24rem]">
          <h2 className="text-lg font-semibold">Add Product</h2>
          {capabilities === null ? (
            <p className="mt-4 text-sm text-slate-600">Loading permissions...</p>
          ) : capabilities.canCreateProductMaster ? (
            <form onSubmit={createProduct} className="mt-4 space-y-3">
              <input
                name="sku"
                required
                placeholder="SKU"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                name="name"
                required
                placeholder="Product name"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                name="barcode"
                placeholder="Barcode"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                name="unit"
                defaultValue="unit"
                placeholder="Unit"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <textarea
                name="description"
                placeholder="Description"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={4}
              />
              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading ? "Saving..." : "Create Product"}
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              Product master creation is restricted to administrators.
            </p>
          )}
        </Card>

        <Card className="xl:col-span-2 min-h-[24rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Product List</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Show archived
            </label>
          </div>

          <div className="mt-4 max-h-[32rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-4">SKU</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Barcode</th>
                  <th className="pb-2 pr-4">Unit</th>
                  <th className="pb-2 pr-4">Active</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-slate-200">
                    <td className="py-2 pr-4 font-medium">{product.sku}</td>
                    <td className="py-2 pr-4">{product.name}</td>
                    <td className="py-2 pr-4">{product.barcode ?? "-"}</td>
                    <td className="py-2 pr-4">{product.unit}</td>
                    <td className="py-2 pr-4">{product.is_active ? "Yes" : "No"}</td>
                    <td className="py-2">
                      {capabilities?.canArchiveProducts ? (
                        product.is_active ? (
                          <Button
                            variant="secondary"
                            disabled={stateLoading}
                            onClick={() => setProductActive(product.id, false)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            disabled={stateLoading}
                            onClick={() => setProductActive(product.id, true)}
                          >
                            Activate
                          </Button>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">restricted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No products found.</p>
            ) : null}
          </div>
        </Card>
      </section>

      <Card className="min-h-[14rem]">
        <h2 className="text-lg font-semibold">Location Reorder Policy</h2>
          {capabilities === null ? (
            <p className="mt-4 text-sm text-slate-600">Loading permissions...</p>
          ) : capabilities.canEditProductPolicies ? (
            <form onSubmit={createPolicy} className="mt-4 grid gap-3 md:grid-cols-5">
            <select
              name="product_id"
              required
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">Select product</option>
              {products
                .filter((product) => product.is_active)
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} - {product.name}
                  </option>
                ))}
            </select>

            <select
              name="location_id"
              required
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">Select location</option>
              {locations
                .filter((location) => location.is_active)
                .map((location) => (
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
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              name="max_qty"
              required
              type="number"
              min={0}
              placeholder="Max qty"
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <div className="flex gap-2">
              <input
                name="reorder_qty"
                required
                type="number"
                min={0}
                placeholder="Reorder qty"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
              <Button type="submit" disabled={policyLoading} className="h-11">
                Save
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            You do not have permission to update product policies.
          </p>
        )}
      </Card>
    </div>
  );
}
