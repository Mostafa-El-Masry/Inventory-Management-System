"use client";

import { useCallback, useEffect, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { MasterCsvSync } from "@/components/master/master-csv-sync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/utils/fetch-json";

type Supplier = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

export default function MasterSuppliersPage() {
  const { capabilities } = useDashboardSession();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    email: "",
    is_active: true,
  });

  const loadSuppliers = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchJson<{ items?: Supplier[] }>(
      `/api/suppliers?include_inactive=${showInactive ? "true" : "false"}`,
      {
        cache: "no-store",
        signal,
        fallbackError: "Failed to load suppliers.",
      },
    );
    if (!result.ok) {
      if (result.error !== "Request aborted.") {
        setError(result.error);
      }
      return;
    }
    setError(null);
    setSuppliers(result.data.items ?? []);
  }, [showInactive]);

  useEffect(() => {
    const controller = new AbortController();
    loadSuppliers(controller.signal).catch(() => setError("Failed to load suppliers."));
    return () => controller.abort();
  }, [loadSuppliers]);

  const canManageSuppliers = capabilities.canManageSuppliers;
  const canCreate = newSupplier.name.trim().length >= 2;

  async function createSupplier() {
    if (!canManageSuppliers || !canCreate) {
      return;
    }

    setCreateLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await fetchJson<{ error?: string }>("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSupplier.name.trim(),
          phone: newSupplier.phone.trim() || null,
          email: newSupplier.email.trim() || null,
          is_active: newSupplier.is_active,
        }),
        fallbackError: "Failed to create supplier.",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNewSupplier({
        name: "",
        phone: "",
        email: "",
        is_active: true,
      });
      setMessage("Supplier created.");
      await loadSuppliers();
    } finally {
      setCreateLoading(false);
    }
  }

  async function setSupplierActive(supplierId: string, active: boolean) {
    if (!canManageSuppliers) {
      return;
    }

    setStateLoading(true);
    setError(null);
    setMessage(null);
    try {
      const endpoint = active ? "activate" : "archive";
      const result = await fetchJson<{ error?: string }>(
        `/api/suppliers/${supplierId}/${endpoint}`,
        {
          method: "POST",
          fallbackError: `Failed to ${endpoint} supplier.`,
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(active ? "Supplier activated." : "Supplier archived.");
      await loadSuppliers();
    } finally {
      setStateLoading(false);
    }
  }

  async function hardDeleteSupplier(supplier: Supplier) {
    if (!canManageSuppliers) {
      return;
    }

    const confirmed = window.confirm(
      `Hard delete supplier "${supplier.name}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setStateLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ error?: string }>(
        `/api/suppliers/${supplier.id}/hard-delete`,
        {
          method: "POST",
          fallbackError: "Failed to hard delete supplier.",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Supplier hard deleted.");
      await loadSuppliers();
    } finally {
      setStateLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="ims-kicker">Master Data</p>
        <h1 className="ims-title text-[2.1rem]">Suppliers</h1>
        <p className="ims-subtitle">Supplier master and payable document ownership.</p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      <MasterCsvSync
        entity="suppliers"
        canManage={canManageSuppliers}
        helperText="Keys by supplier code. Reimport updates matching codes and inserts missing ones."
        onImported={async () => {
          await loadSuppliers();
        }}
      />

      <Card className="min-h-[24rem]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Supplier List</h2>
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show archived
          </label>
        </div>

        <div className="mt-4 max-h-[34rem] overflow-auto">
          <table className="ims-table">
            <thead className="ims-table-head">
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="ims-table-row">
                  <td className="font-medium">{supplier.code}</td>
                  <td>{supplier.name}</td>
                  <td>{supplier.phone ?? "-"}</td>
                  <td>{supplier.email ?? "-"}</td>
                  <td>{supplier.is_active ? "Yes" : "No"}</td>
                  <td>
                    {canManageSuppliers ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {supplier.is_active ? (
                          <Button
                            variant="secondary"
                            className="h-9"
                            disabled={stateLoading}
                            onClick={() => setSupplierActive(supplier.id, false)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="h-9"
                            disabled={stateLoading}
                            onClick={() => setSupplierActive(supplier.id, true)}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          className="h-9"
                          disabled={stateLoading}
                          onClick={() => hardDeleteSupplier(supplier)}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">restricted</span>
                    )}
                  </td>
                </tr>
              ))}
              {canManageSuppliers ? (
                <tr className="ims-table-row">
                  <td className="font-medium text-[var(--text-muted)]">Auto</td>
                  <td>
                    <Input
                      value={newSupplier.name}
                      onChange={(event) =>
                        setNewSupplier((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Supplier name"
                      className="h-9"
                    />
                  </td>
                  <td>
                    <Input
                      value={newSupplier.phone}
                      onChange={(event) =>
                        setNewSupplier((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      placeholder="Phone"
                      className="h-9"
                    />
                  </td>
                  <td>
                    <Input
                      value={newSupplier.email}
                      onChange={(event) =>
                        setNewSupplier((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="Email"
                      className="h-9"
                    />
                  </td>
                  <td>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newSupplier.is_active}
                        onChange={(event) =>
                          setNewSupplier((current) => ({
                            ...current,
                            is_active: event.target.checked,
                          }))
                        }
                      />
                      {newSupplier.is_active ? "Yes" : "No"}
                    </label>
                  </td>
                  <td>
                    <Button
                      className="h-9"
                      disabled={!canCreate || createLoading}
                      onClick={() => createSupplier()}
                    >
                      {createLoading ? "Creating..." : "Create"}
                    </Button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {suppliers.length === 0 ? (
            <p className="ims-empty mt-3">No suppliers found.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
