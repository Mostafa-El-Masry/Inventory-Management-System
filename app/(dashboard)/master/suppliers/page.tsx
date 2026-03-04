"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Supplier = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type AuthMe = {
  capabilities: {
    canManageSuppliers: boolean;
  };
};

export default function MasterSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [capabilities, setCapabilities] = useState<AuthMe["capabilities"] | null>(
    null,
  );
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

  const loadSuppliers = useCallback(async () => {
    const response = await fetch(
      `/api/suppliers?include_inactive=${showInactive ? "true" : "false"}`,
      { cache: "no-store" },
    );
    const json = (await response.json()) as { items?: Supplier[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to load suppliers.");
      return;
    }
    setError(null);
    setSuppliers(json.items ?? []);
  }, [showInactive]);

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
    loadAuth().catch(() => setError("Failed to load permissions."));
  }, [loadAuth]);

  useEffect(() => {
    loadSuppliers().catch(() => setError("Failed to load suppliers."));
  }, [loadSuppliers]);

  const canManageSuppliers = capabilities?.canManageSuppliers ?? false;
  const canCreate = newSupplier.name.trim().length >= 2;

  async function createSupplier() {
    if (!canManageSuppliers || !canCreate) {
      return;
    }

    setCreateLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSupplier.name.trim(),
        phone: newSupplier.phone.trim() || null,
        email: newSupplier.email.trim() || null,
        is_active: newSupplier.is_active,
      }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create supplier.");
      setCreateLoading(false);
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
    setCreateLoading(false);
  }

  async function setSupplierActive(supplierId: string, active: boolean) {
    if (!canManageSuppliers) {
      return;
    }

    setStateLoading(true);
    setError(null);
    setMessage(null);
    const endpoint = active ? "activate" : "archive";
    const response = await fetch(`/api/suppliers/${supplierId}/${endpoint}`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? `Failed to ${endpoint} supplier.`);
      setStateLoading(false);
      return;
    }

    setMessage(active ? "Supplier activated." : "Supplier archived.");
    await loadSuppliers();
    setStateLoading(false);
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
    const response = await fetch(`/api/suppliers/${supplier.id}/hard-delete`, {
      method: "POST",
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to hard delete supplier.");
      setStateLoading(false);
      return;
    }

    setMessage("Supplier hard deleted.");
    await loadSuppliers();
    setStateLoading(false);
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
