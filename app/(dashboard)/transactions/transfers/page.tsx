"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  notes?: string | null;
  created_at: string;
  transfer_lines?: Array<{
    id: string;
    product_id: string;
    requested_qty: number;
    dispatched_qty: number;
    received_qty: number;
  }>;
};

type Lookup = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
};

type Section = "material-request" | "material-transfer" | "direct-transfer";

const DIRECT_NOTE_PREFIX = "[DIRECT]";

function isDirectTransfer(transfer: Transfer) {
  return (transfer.notes ?? "").startsWith(DIRECT_NOTE_PREFIX);
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [products, setProducts] = useState<Lookup[]>([]);
  const [section, setSection] = useState<Section>("material-request");
  const [message, setMessage] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    from_location_id: "",
    to_location_id: "",
    product_id: "",
    requested_qty: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function loadTransfers() {
    const response = await fetch("/api/transfers?limit=200", { cache: "no-store" });
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

  const locationById = useMemo(() => {
    const mapped = new Map<string, Lookup>();
    for (const location of locations) {
      mapped.set(location.id, location);
    }
    return mapped;
  }, [locations]);

  const productById = useMemo(() => {
    const mapped = new Map<string, Lookup>();
    for (const product of products) {
      mapped.set(product.id, product);
    }
    return mapped;
  }, [products]);

  const materialTransfers = useMemo(
    () => transfers.filter((transfer) => !isDirectTransfer(transfer)),
    [transfers],
  );
  const materialRequests = useMemo(
    () => materialTransfers.filter((transfer) => transfer.status === "REQUESTED"),
    [materialTransfers],
  );
  const directTransfers = useMemo(
    () => transfers.filter((transfer) => isDirectTransfer(transfer)),
    [transfers],
  );

  function formatLookup(lookup: Lookup | undefined, fallback: string) {
    if (!lookup) {
      return "--";
    }
    const code = lookup.code ?? lookup.sku ?? fallback;
    return `${code} - ${lookup.name}`;
  }

  async function createMaterialRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestLoading(true);
    setError(null);
    setMessage(null);

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
      setError(json.error ?? "Failed to create material request.");
      setRequestLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    setMessage("Material request created.");
    await loadTransfers();
    setRequestLoading(false);
  }

  async function createDirectTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDirectLoading(true);
    setError(null);
    setMessage(null);

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

    const response = await fetch("/api/transfers/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to create direct transfer.");
      setDirectLoading(false);
      return;
    }

    (event.currentTarget as HTMLFormElement).reset();
    setMessage("Direct transfer completed.");
    await loadTransfers();
    setDirectLoading(false);
  }

  async function approveTransfer(id: string) {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/transfers/${id}/approve`, { method: "POST" });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to approve transfer.");
      setActionLoading(false);
      return;
    }
    setMessage("Material request approved.");
    await loadTransfers();
    setActionLoading(false);
  }

  async function rejectTransfer(transfer: Transfer) {
    const reason = window.prompt("Reject reason (optional)") ?? "";

    setActionLoading(true);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/transfers/${transfer.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: reason.trim() || undefined }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to reject transfer.");
      setActionLoading(false);
      return;
    }
    setMessage(`Transfer ${transfer.transfer_number} rejected.`);
    await loadTransfers();
    setActionLoading(false);
  }

  async function transferMaterial(transfer: Transfer) {
    setActionLoading(true);
    setError(null);
    setMessage(null);

    if (transfer.status === "APPROVED") {
      const dispatchResponse = await fetch(`/api/transfers/${transfer.id}/dispatch`, {
        method: "POST",
      });
      const dispatchJson = (await dispatchResponse.json()) as { error?: string };
      if (!dispatchResponse.ok) {
        setError(dispatchJson.error ?? "Failed to dispatch transfer.");
        setActionLoading(false);
        return;
      }
    }

    const receiveResponse = await fetch(`/api/transfers/${transfer.id}/receive`, {
      method: "POST",
    });
    const receiveJson = (await receiveResponse.json()) as { error?: string };
    if (!receiveResponse.ok) {
      setError(
        receiveJson.error ??
          "Dispatch succeeded but receive failed. You can retry from this row.",
      );
      await loadTransfers();
      setActionLoading(false);
      return;
    }

    setMessage(`Transfer ${transfer.transfer_number} completed.`);
    await loadTransfers();
    setActionLoading(false);
  }

  function startEditTransfer(transfer: Transfer) {
    const firstLine = transfer.transfer_lines?.[0];
    if (!firstLine) {
      setError("Transfer has no editable lines.");
      return;
    }
    setEditingTransferId(transfer.id);
    setEditForm({
      from_location_id: transfer.from_location_id,
      to_location_id: transfer.to_location_id,
      product_id: firstLine.product_id,
      requested_qty: String(firstLine.requested_qty),
      notes: transfer.notes ?? "",
    });
    setSection("material-transfer");
  }

  async function saveEditTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransferId) {
      return;
    }

    setEditLoading(true);
    setError(null);
    setMessage(null);

    const payload = {
      from_location_id: editForm.from_location_id,
      to_location_id: editForm.to_location_id,
      notes: editForm.notes.trim() || null,
      lines: [
        {
          product_id: editForm.product_id,
          requested_qty: Number(editForm.requested_qty),
        },
      ],
    };

    const response = await fetch(`/api/transfers/${editingTransferId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Failed to edit transfer.");
      setEditLoading(false);
      return;
    }

    setEditingTransferId(null);
    setEditForm({
      from_location_id: "",
      to_location_id: "",
      product_id: "",
      requested_qty: "",
      notes: "",
    });
    setMessage("Material request updated.");
    await loadTransfers();
    setEditLoading(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="ims-kicker">Transfers</p>
        <h1 className="ims-title text-[2.1rem]">Transfers</h1>
        <p className="ims-subtitle">
          Material Request, Material Transfer workflow, and Direct Transfer.
        </p>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={section === "material-request" ? "secondary" : "ghost"}
          className="h-10"
          onClick={() => setSection("material-request")}
        >
          Material Request
        </Button>
        <Button
          variant={section === "material-transfer" ? "secondary" : "ghost"}
          className="h-10"
          onClick={() => setSection("material-transfer")}
        >
          Material Transfer
        </Button>
        <Button
          variant={section === "direct-transfer" ? "secondary" : "ghost"}
          className="h-10"
          onClick={() => setSection("direct-transfer")}
        >
          Direct Transfer
        </Button>
      </div>

      {section === "material-request" ? (
        <>
          <Card className="min-h-[18rem]">
            <h2 className="text-lg font-semibold">Create Material Request</h2>
            <form onSubmit={createMaterialRequest} className="mt-4 grid gap-3 md:grid-cols-5">
              <Select name="from_location_id" required className="h-11">
                <option value="">From location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="to_location_id" required className="h-11">
                <option value="">To location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="product_id" required className="h-11">
                <option value="">Product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {formatLookup(product, "SKU")}
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
              <Button type="submit" disabled={requestLoading} className="h-11 rounded-2xl">
                {requestLoading ? "Saving..." : "Create Request"}
              </Button>
              <Input name="notes" placeholder="Notes" className="h-11 md:col-span-5" />
            </form>
          </Card>

          <Card className="min-h-[20rem]">
            <h2 className="text-lg font-semibold">Open Material Requests</h2>
            <div className="mt-4 max-h-[28rem] overflow-auto">
              <table className="ims-table">
                <thead className="ims-table-head">
                  <tr>
                    <th>Number</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {materialRequests.map((transfer) => {
                    const line = transfer.transfer_lines?.[0];
                    return (
                      <tr key={transfer.id} className="ims-table-row">
                        <td className="font-medium">{transfer.transfer_number}</td>
                        <td>{formatLookup(locationById.get(transfer.from_location_id), "LOC")}</td>
                        <td>{formatLookup(locationById.get(transfer.to_location_id), "LOC")}</td>
                        <td>{line ? formatLookup(productById.get(line.product_id), "SKU") : "--"}</td>
                        <td>{line?.requested_qty ?? "--"}</td>
                        <td>{new Date(transfer.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {materialRequests.length === 0 ? (
                <p className="ims-empty mt-3">No open material requests.</p>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}

      {section === "material-transfer" ? (
        <>
          {editingTransferId ? (
            <Card className="min-h-[14rem]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Edit Material Request</h2>
                <Button
                  variant="ghost"
                  className="h-9"
                  onClick={() => {
                    setEditingTransferId(null);
                    setEditForm({
                      from_location_id: "",
                      to_location_id: "",
                      product_id: "",
                      requested_qty: "",
                      notes: "",
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
              <form onSubmit={saveEditTransfer} className="mt-4 grid gap-3 md:grid-cols-5">
                <Select
                  required
                  className="h-11"
                  value={editForm.from_location_id}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, from_location_id: event.target.value }))
                  }
                >
                  <option value="">From location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatLookup(location, "LOC")}
                    </option>
                  ))}
                </Select>
                <Select
                  required
                  className="h-11"
                  value={editForm.to_location_id}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, to_location_id: event.target.value }))
                  }
                >
                  <option value="">To location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatLookup(location, "LOC")}
                    </option>
                  ))}
                </Select>
                <Select
                  required
                  className="h-11"
                  value={editForm.product_id}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, product_id: event.target.value }))
                  }
                >
                  <option value="">Product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {formatLookup(product, "SKU")}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={1}
                  required
                  className="h-11"
                  value={editForm.requested_qty}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, requested_qty: event.target.value }))
                  }
                />
                <Button type="submit" className="h-11 rounded-2xl" disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save Changes"}
                </Button>
                <Input
                  className="h-11 md:col-span-5"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </form>
            </Card>
          ) : null}

          <Card className="min-h-[24rem]">
            <h2 className="text-lg font-semibold">Material Transfer Queue</h2>
            <div className="mt-4 max-h-[34rem] overflow-auto">
              <table className="ims-table">
                <thead className="ims-table-head">
                  <tr>
                    <th>Number</th>
                    <th>Status</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {materialTransfers.map((transfer) => {
                    const line = transfer.transfer_lines?.[0];
                    return (
                      <tr key={transfer.id} className="ims-table-row">
                        <td className="font-medium">{transfer.transfer_number}</td>
                        <td>{transfer.status}</td>
                        <td>{formatLookup(locationById.get(transfer.from_location_id), "LOC")}</td>
                        <td>{formatLookup(locationById.get(transfer.to_location_id), "LOC")}</td>
                        <td>{line ? formatLookup(productById.get(line.product_id), "SKU") : "--"}</td>
                        <td>{line?.requested_qty ?? "--"}</td>
                        <td>{new Date(transfer.created_at).toLocaleString()}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {transfer.status === "REQUESTED" ? (
                              <>
                                <Button
                                  variant="secondary"
                                  className="h-9"
                                  disabled={actionLoading}
                                  onClick={() => approveTransfer(transfer.id)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="h-9"
                                  disabled={actionLoading || editLoading}
                                  onClick={() => startEditTransfer(transfer)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  className="h-9"
                                  disabled={actionLoading}
                                  onClick={() => rejectTransfer(transfer)}
                                >
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            {transfer.status === "APPROVED" ? (
                              <>
                                <Button
                                  variant="secondary"
                                  className="h-9"
                                  disabled={actionLoading}
                                  onClick={() => transferMaterial(transfer)}
                                >
                                  Transfer
                                </Button>
                                <Button
                                  variant="danger"
                                  className="h-9"
                                  disabled={actionLoading}
                                  onClick={() => rejectTransfer(transfer)}
                                >
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            {transfer.status === "DISPATCHED" ? (
                              <Button
                                variant="secondary"
                                className="h-9"
                                disabled={actionLoading}
                                onClick={() => transferMaterial(transfer)}
                              >
                                Receive
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {materialTransfers.length === 0 ? (
                <p className="ims-empty mt-3">No material transfers found.</p>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}

      {section === "direct-transfer" ? (
        <>
          <Card className="min-h-[18rem]">
            <h2 className="text-lg font-semibold">Create Direct Transfer</h2>
            <form onSubmit={createDirectTransfer} className="mt-4 grid gap-3 md:grid-cols-5">
              <Select name="from_location_id" required className="h-11">
                <option value="">From location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="to_location_id" required className="h-11">
                <option value="">To location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLookup(location, "LOC")}
                  </option>
                ))}
              </Select>
              <Select name="product_id" required className="h-11">
                <option value="">Product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {formatLookup(product, "SKU")}
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
              <Button type="submit" disabled={directLoading} className="h-11 rounded-2xl">
                {directLoading ? "Transferring..." : "Transfer Now"}
              </Button>
              <Input name="notes" placeholder="Notes" className="h-11 md:col-span-5" />
            </form>
          </Card>

          <Card className="min-h-[20rem]">
            <h2 className="text-lg font-semibold">Direct Transfer History</h2>
            <div className="mt-4 max-h-[28rem] overflow-auto">
              <table className="ims-table">
                <thead className="ims-table-head">
                  <tr>
                    <th>Number</th>
                    <th>Status</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Created</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {directTransfers.map((transfer) => (
                    <tr key={transfer.id} className="ims-table-row">
                      <td className="font-medium">{transfer.transfer_number}</td>
                      <td>{transfer.status}</td>
                      <td>{formatLookup(locationById.get(transfer.from_location_id), "LOC")}</td>
                      <td>{formatLookup(locationById.get(transfer.to_location_id), "LOC")}</td>
                      <td>{new Date(transfer.created_at).toLocaleString()}</td>
                      <td>{(transfer.notes ?? "").replace(DIRECT_NOTE_PREFIX, "").trim() || "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {directTransfers.length === 0 ? (
                <p className="ims-empty mt-3">No direct transfers found.</p>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

