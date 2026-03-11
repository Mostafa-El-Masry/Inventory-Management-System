"use client";

import { useCallback, useEffect, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Card } from "@/components/ui/card";
import { FilterPopover } from "@/components/ui/filter-popover";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  buildFilterStorageKey,
  readLocalFilterState,
  removeLocalFilterState,
  writeLocalFilterState,
} from "@/lib/utils/local-filter-storage";
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

type InventoryFilterState = {
  productId: string;
  locationId: string;
  asOfDate: string;
};

export default function InventoryPage() {
  const { userId: authUserId } = useDashboardSession();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  const inventoryFilterStorageKey = buildFilterStorageKey(authUserId, "inventory");

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

  const buildStockQuery = useCallback(
    (
      nextFilters: {
        productId?: string;
        locationId?: string;
        asOfDate?: string;
      } = {},
    ) => {
      const params = new URLSearchParams();
      const nextProductId = nextFilters.productId ?? productId;
      const nextLocationId = nextFilters.locationId ?? locationId;
      const nextAsOfDate = nextFilters.asOfDate ?? asOfDate;

      if (nextProductId) params.set("product_id", nextProductId);
      if (nextLocationId) params.set("location_id", nextLocationId);
      if (nextAsOfDate) params.set("as_of_date", nextAsOfDate);

      return params.toString() ? `?${params.toString()}` : "";
    },
    [asOfDate, locationId, productId],
  );

  useEffect(() => {
    const saved = readLocalFilterState<Partial<InventoryFilterState>>(inventoryFilterStorageKey);
    setProductId(typeof saved?.productId === "string" ? saved.productId : "");
    setLocationId(typeof saved?.locationId === "string" ? saved.locationId : "");
    setAsOfDate(typeof saved?.asOfDate === "string" ? saved.asOfDate : "");
    setFiltersHydrated(true);
  }, [inventoryFilterStorageKey]);

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    const controller = new AbortController();
    Promise.all([
      loadStock(buildStockQuery(), controller.signal),
      loadLookups(controller.signal),
    ]).catch(() => {
      setError("Failed to load inventory data.");
    });
    return () => controller.abort();
  }, [buildStockQuery, filtersHydrated]);

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    if (!productId && !locationId && !asOfDate) {
      removeLocalFilterState(inventoryFilterStorageKey);
      return;
    }

    writeLocalFilterState(inventoryFilterStorageKey, {
      productId,
      locationId,
      asOfDate,
    } satisfies InventoryFilterState);
  }, [asOfDate, filtersHydrated, inventoryFilterStorageKey, locationId, productId]);

  async function applyFilters() {
    await loadStock(buildStockQuery());
  }

  async function clearFilters() {
    setProductId("");
    setLocationId("");
    setAsOfDate("");
    removeLocalFilterState(inventoryFilterStorageKey);
    await loadStock("");
  }

  const filtersApplied = Boolean(productId || locationId || asOfDate);
  const totalInventoryValue = rows.reduce(
    (sum, row) => sum + row.qty_on_hand * Number(row.unit_cost ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Inventory</p>
        <h1 className="ims-title">Inventory Stock</h1>
        <p className="ims-subtitle">
          Batch-level stock with lot, expiry date, and available quantity.
        </p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}

      <Card className="min-h-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="ims-field-label">
              {filtersApplied ? "Filtered Inventory Value" : "Total Inventory Value"}
            </p>
            <p className="mt-2 text-[clamp(1.8rem,1.6rem+1vw,2.6rem)] font-semibold text-[var(--text-strong)]">
              KWD {totalInventoryValue.toFixed(2)}
            </p>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {asOfDate
              ? `Calculated from the filtered stock snapshot as of ${asOfDate}.`
              : "Calculated from the currently filtered stock batches."}
          </p>
        </div>
      </Card>

      <Card className="min-h-[22rem]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[clamp(1.05rem,1rem+0.22vw,1.2rem)] font-semibold text-[var(--text-strong)]">
              Stock Batches {loading ? "(Loading...)" : ""}
            </h2>
            <p className="mt-2 text-[clamp(0.9rem,0.87rem+0.12vw,0.98rem)] text-[var(--text-muted)]">
              {asOfDate
                ? `Showing stock snapshot as of ${asOfDate}.`
                : "Leave date empty to show current stock."}
            </p>
          </div>

          <FilterPopover
            title="Inventory Filters"
            applied={filtersApplied}
            onApply={() => applyFilters()}
            onClear={() => clearFilters()}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="ims-field-label mb-0">Product</span>
                <Select
                  value={productId}
                  className="ims-control-lg"
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="">All products</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {(product.sku ?? "SKU")} - {product.name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-2">
                <span className="ims-field-label mb-0">Location</span>
                <Select
                  value={locationId}
                  className="ims-control-lg"
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  <option value="">All locations</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {(location.code ?? "LOC")} - {location.name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="ims-field-label mb-0">As of date</span>
                <Input
                  type="date"
                  className="ims-control-lg"
                  value={asOfDate}
                  onChange={(event) => setAsOfDate(event.target.value)}
                />
              </label>
            </div>
          </FilterPopover>
        </div>

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
