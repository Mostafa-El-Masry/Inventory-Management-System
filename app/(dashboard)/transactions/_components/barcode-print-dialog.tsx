"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import type { BarcodePrintFormat } from "./barcode-print";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: { format: BarcodePrintFormat; quantity: number }) => void;
};

export function BarcodePrintDialog({ open, onClose, onConfirm }: Props) {
  if (!open) {
    return null;
  }

  return <BarcodePrintDialogContent onClose={onClose} onConfirm={onConfirm} />;
}

type ContentProps = {
  onClose: () => void;
  onConfirm: (options: { format: BarcodePrintFormat; quantity: number }) => void;
};

function BarcodePrintDialogContent({ onClose, onConfirm }: ContentProps) {
  const [format, setFormat] = useState<BarcodePrintFormat>("a4");
  const [quantity, setQuantity] = useState("1");
  const [validationError, setValidationError] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode print settings"
    >
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]">
        <h3 className="text-base font-semibold text-[var(--text-strong)]">Print Barcodes</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Choose label format and quantity for each product line.
        </p>

        <div className="mt-4 space-y-3">
          <label className="space-y-1">
            <span className="ims-field-label mb-0">Label format</span>
            <Select
              className="h-10"
              value={format}
              onChange={(event) => setFormat(event.target.value as BarcodePrintFormat)}
            >
              <option value="a4">A4 Grid</option>
              <option value="thermal">Thermal</option>
            </Select>
          </label>

          <label className="space-y-1">
            <span className="ims-field-label mb-0">Quantity per line</span>
            <Input
              type="number"
              min={1}
              step={1}
              className="h-10"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setValidationError(null);
              }}
            />
          </label>
        </div>

        {validationError ? <p className="ims-alert-danger mt-3 text-sm">{validationError}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-10"
            onClick={() => {
              const parsed = Number(quantity);
              if (!Number.isInteger(parsed) || parsed < 1) {
                setValidationError("Quantity must be an integer greater than or equal to 1.");
                return;
              }
              onConfirm({ format, quantity: parsed });
            }}
          >
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}
