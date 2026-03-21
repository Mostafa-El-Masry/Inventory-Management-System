"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { useDashboardSession } from "@/components/layout/dashboard-session-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAIN_WAREHOUSE_NAME } from "@/lib/locations/main-warehouse-constants";
import {
  formatSystemCurrency,
  formatSystemCurrencyParts,
  getSystemCurrencyInputStep,
  roundSystemCurrencyValue,
  type SystemCurrencyCode,
} from "@/lib/settings/system-currency";
import {
  buildPurchaseDraftPayloadLines,
  PURCHASE_DRAFT_MATCH_LIMIT,
  PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH,
  createEmptyPurchaseDraftRow,
  ensureTrailingBlankPurchaseDraftRow,
  getPurchaseDraftInitialSuggestionIndex,
  movePurchaseDraftSuggestionIndex,
  type PurchaseDraftRow,
  type PurchaseLookupProduct,
} from "@/lib/transactions/purchase-invoice-draft";
import type { TransactionDetailResponse, TransactionLineDetail } from "@/lib/types/api";
import { fetchJson } from "@/lib/utils/fetch-json";

type Lookup = {
  id: string;
  name: string;
  code?: string | null;
  sku?: string | null;
  barcode?: string | null;
};

type InvoiceLineDraft = {
  clientId: string;
  productId: string;
  qty: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
  displayCode?: string | null;
  displayName?: string | null;
  displayBarcode?: string | null;
};

type PurchaseDefaultsResponse = {
  product_id: string;
  last_unit_cost: number | null;
  last_unit_cost_at: string | null;
  has_history: boolean;
};

type PurchaseLookupResponse = {
  items?: PurchaseLookupProduct[];
};

type PurchaseAutocompleteField = "item" | "sku";
const PURCHASE_LOOKUP_DEBOUNCE_MS = 150;
const PURCHASE_SUPPLIER_MATCH_LIMIT = 8;

function createLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function buildLineTotal(
  line: Pick<InvoiceLineDraft, "qty" | "unitCost">,
  currencyCode: SystemCurrencyCode,
) {
  const qty = Number(line.qty);
  const unitCost = Number(line.unitCost);
  if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) {
    return 0;
  }

  return roundSystemCurrencyValue(qty * unitCost, currencyCode);
}

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSearchInput(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function formatSupplierOptionLabel(supplier: Pick<Lookup, "name" | "code">) {
  return supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name;
}

function getSupplierSuggestions(suppliers: Lookup[], query: string) {
  const normalizedQuery = normalizeComparableText(query);
  if (!normalizedQuery) {
    return [];
  }

  return suppliers
    .filter((supplier) => {
      const normalizedName = normalizeComparableText(supplier.name);
      const normalizedCode = normalizeComparableText(supplier.code);
      const normalizedLabel = normalizeComparableText(formatSupplierOptionLabel(supplier));

      return (
        normalizedName.startsWith(normalizedQuery) ||
        normalizedCode.startsWith(normalizedQuery) ||
        normalizedLabel.startsWith(normalizedQuery)
      );
    })
    .slice(0, PURCHASE_SUPPLIER_MATCH_LIMIT);
}

function getPurchaseDraftEditorSku(
  product?: Pick<PurchaseLookupProduct, "sku"> | null,
  fallbackDisplayCode?: string | null,
) {
  return product?.sku?.trim() || fallbackDisplayCode?.trim() || "";
}

function createNextDraftRow() {
  return createEmptyPurchaseDraftRow(createLineId());
}

function createInvoiceLineDraft(line: TransactionLineDetail): InvoiceLineDraft {
  return {
    clientId: line.id || createLineId(),
    productId: line.product_id,
    qty: String(line.qty),
    unitCost:
      line.unit_cost == null || !Number.isFinite(line.unit_cost)
        ? ""
        : String(line.unit_cost),
    lotNumber: line.lot_number ?? "",
    expiryDate: formatDateInput(line.expiry_date),
    displayCode: line.product_display_code,
    displayName: line.product_display_name,
    displayBarcode: line.product_barcode,
  };
}

function createDraftRowFromInvoiceLine(
  line: InvoiceLineDraft,
  product?: PurchaseLookupProduct,
): PurchaseDraftRow {
  return {
    clientId: line.clientId,
    productId: line.productId,
    skuQuery: getPurchaseDraftEditorSku(product, line.displayCode),
    itemQuery: product?.name ?? line.displayName?.trim() ?? "",
    qty: line.qty,
    unitCost: line.unitCost,
    lotNumber: line.lotNumber,
    expiryDate: line.expiryDate,
  };
}

function createLookupProductFromInvoiceLine(
  line: InvoiceLineDraft,
): PurchaseLookupProduct | null {
  const productId = line.productId.trim();
  if (!productId) {
    return null;
  }

  return {
    id: productId,
    name: line.displayName?.trim() ?? "",
    sku: line.displayCode?.trim() || null,
    barcode: line.displayBarcode?.trim() || null,
  };
}

function mergeLookupProducts(
  current: PurchaseLookupProduct[],
  incoming: PurchaseLookupProduct[],
) {
  const merged = new Map(current.map((product) => [product.id, product]));

  for (const product of incoming) {
    const existing = merged.get(product.id);
    merged.set(product.id, {
      id: product.id,
      name: product.name || existing?.name || "",
      sku: product.sku ?? existing?.sku ?? null,
      barcode: product.barcode ?? existing?.barcode ?? null,
    });
  }

  return Array.from(merged.values());
}

function buildPurchaseLookupCacheKey(
  field: PurchaseAutocompleteField,
  query: string,
) {
  return `${field}:${normalizeComparableText(query)}`;
}

function PurchaseResponsiveCurrencyValue({
  value,
  currencyCode,
  align = "start",
  emphasized = false,
}: {
  value: number;
  currencyCode: SystemCurrencyCode;
  align?: "start" | "end";
  emphasized?: boolean;
}) {
  const parts = formatSystemCurrencyParts(value, currencyCode);
  const amountText = parts.currency ? parts.amount : parts.fullText;

  return (
    <div
      title={parts.fullText}
      className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${
        align === "end" ? "justify-end text-right" : "text-left"
      }`}
    >
      {parts.currency ? (
        <span className="shrink-0 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {parts.currency}
        </span>
      ) : null}
      <span
        className={`min-w-0 break-all font-semibold leading-tight text-[var(--text-strong)] tabular-nums sm:break-normal ${
          emphasized
            ? "text-[clamp(1rem,0.95rem+0.3vw,1.2rem)]"
            : "text-[clamp(0.95rem,0.91rem+0.24vw,1.08rem)]"
        }`}
      >
        {amountText}
      </span>
    </div>
  );
}

function PurchaseLineProductDisplay({
  product,
  line,
}: {
  product?: Lookup;
  line: InvoiceLineDraft;
}) {
  const displayCode = product?.sku ?? line.displayCode ?? "SKU";
  const displayName = product?.name ?? line.displayName ?? "--";
  const displayBarcode = product?.barcode ?? line.displayBarcode ?? "--";

  return (
    <div>
      <p className="font-medium text-[var(--text-strong)]">
        {displayCode} - {displayName}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Barcode {displayBarcode}</p>
      {line.lotNumber || line.expiryDate ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {line.lotNumber ? `Lot ${line.lotNumber}` : "No lot"}
          {line.expiryDate ? ` | Exp ${formatDisplayDate(line.expiryDate)}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function PurchaseAutocompleteInput({
  label,
  placeholder,
  value,
  field,
  disabled,
  onChange,
  onSelect,
  onSearch,
}: {
  label: string;
  placeholder: string;
  value: string;
  field: PurchaseAutocompleteField;
  disabled: boolean;
  onChange: (value: string) => void;
  onSelect: (product: PurchaseLookupProduct) => void;
  onSearch: (
    field: PurchaseAutocompleteField,
    query: string,
    signal: AbortSignal,
  ) => Promise<PurchaseLookupProduct[]>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PurchaseLookupProduct[]>([]);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isInputFocusedRef = useRef(false);
  const skipNextSearchRef = useRef(false);
  const showSuggestions = isOpen && !disabled && suggestions.length > 0;
  const searchSuggestions = useEffectEvent(
    (query: string, signal: AbortSignal) => onSearch(field, query, signal),
  );
  const activeSuggestionIndex = useMemo(() => {
    if (!showSuggestions) {
      return getPurchaseDraftInitialSuggestionIndex(0);
    }

    if (
      highlightedSuggestionIndex < 0 ||
      highlightedSuggestionIndex >= suggestions.length
    ) {
      return getPurchaseDraftInitialSuggestionIndex(suggestions.length);
    }

    return highlightedSuggestionIndex;
  }, [highlightedSuggestionIndex, showSuggestions, suggestions.length]);

  useEffect(() => {
    if (!showSuggestions || activeSuggestionIndex < 0) {
      if (!showSuggestions) {
        suggestionRefs.current = [];
      }
      return;
    }

    suggestionRefs.current[activeSuggestionIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestionIndex, showSuggestions]);

  useEffect(() => {
    const normalizedQuery = normalizeSearchInput(value);

    if (disabled || normalizedQuery.length < PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH) {
      return;
    }

    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(async () => {
      const results = await searchSuggestions(normalizedQuery, controller.signal);
      if (controller.signal.aborted || !isInputFocusedRef.current) {
        return;
      }

      setSuggestions(results);
      if (results.length > 0) {
        setIsOpen(true);
      }
    }, PURCHASE_LOOKUP_DEBOUNCE_MS);

    return () => {
      controller.abort();
      globalThis.clearTimeout(timeoutId);
    };
  }, [disabled, value]);

  return (
    <div className="relative min-w-0">
      <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:sr-only">
        {label}
      </p>
      <Input
        className="ims-control-lg"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        title={field === "item" && value.trim() ? value.trim() : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setSuggestions([]);
          setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
        }}
        onFocus={() => {
          isInputFocusedRef.current = true;
          setIsOpen(true);
          setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(suggestions.length));
        }}
        onBlur={() => {
          isInputFocusedRef.current = false;
          globalThis.setTimeout(() => {
            setIsOpen(false);
            setSuggestions([]);
          }, 120);
        }}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedSuggestionIndex((currentIndex) =>
              movePurchaseDraftSuggestionIndex(
                currentIndex,
                event.key === "ArrowDown" ? "next" : "previous",
                suggestions.length,
              ),
            );
            return;
          }

          if (event.key === "Escape") {
            setIsOpen(false);
            setSuggestions([]);
            setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
            return;
          }

          if (event.key === "Enter" && showSuggestions) {
            event.preventDefault();
            skipNextSearchRef.current = true;
            onSelect(suggestions[activeSuggestionIndex] ?? suggestions[0]!);
            setIsOpen(false);
            setSuggestions([]);
            setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
          }
        }}
      />
      {showSuggestions ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-20 max-h-[18rem] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]"
        >
          {suggestions.map((product, index) => {
            const secondaryLabel = getPurchaseDraftEditorSku(product);
            const isActive = index === activeSuggestionIndex;

            return (
              <button
                key={product.id}
                ref={(element) => {
                  suggestionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isActive}
                title={product.name}
                className={`flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left transition ${
                  isActive ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]"
                }`}
                onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  skipNextSearchRef.current = true;
                  onSelect(product);
                  setIsOpen(false);
                  setSuggestions([]);
                  setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
                }}
              >
                <span className="min-w-0 truncate font-medium text-[var(--text-strong)]">
                  {product.name}
                </span>
                {secondaryLabel ? (
                  <span className="min-w-0 truncate text-xs text-[var(--text-muted)]">
                    {secondaryLabel}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PurchaseSupplierInput({
  value,
  suppliers,
  disabled,
  onChange,
  onSelect,
}: {
  value: string;
  suppliers: Lookup[];
  disabled: boolean;
  onChange: (value: string) => void;
  onSelect: (supplier: Lookup) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isInputFocusedRef = useRef(false);
  const suggestions = useMemo(
    () => getSupplierSuggestions(suppliers, value),
    [suppliers, value],
  );
  const showSuggestions = isOpen && !disabled && suggestions.length > 0;
  const activeSuggestionIndex = useMemo(() => {
    if (!showSuggestions) {
      return getPurchaseDraftInitialSuggestionIndex(0);
    }

    if (
      highlightedSuggestionIndex < 0 ||
      highlightedSuggestionIndex >= suggestions.length
    ) {
      return getPurchaseDraftInitialSuggestionIndex(suggestions.length);
    }

    return highlightedSuggestionIndex;
  }, [highlightedSuggestionIndex, showSuggestions, suggestions.length]);

  useEffect(() => {
    if (!showSuggestions || activeSuggestionIndex < 0) {
      if (!showSuggestions) {
        suggestionRefs.current = [];
      }
      return;
    }

    suggestionRefs.current[activeSuggestionIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestionIndex, showSuggestions]);

  return (
    <div className="relative min-w-0">
      <Input
        className="ims-control-lg"
        value={value}
        placeholder="Select supplier"
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        title={value.trim() || undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
        }}
        onFocus={() => {
          isInputFocusedRef.current = true;
          setIsOpen(true);
          setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(suggestions.length));
        }}
        onBlur={() => {
          isInputFocusedRef.current = false;
          globalThis.setTimeout(() => {
            setIsOpen(false);
          }, 120);
        }}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedSuggestionIndex((currentIndex) =>
              movePurchaseDraftSuggestionIndex(
                currentIndex,
                event.key === "ArrowDown" ? "next" : "previous",
                suggestions.length,
              ),
            );
            return;
          }

          if (event.key === "Escape") {
            setIsOpen(false);
            setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
            return;
          }

          if (event.key === "Enter" && showSuggestions) {
            event.preventDefault();
            onSelect(suggestions[activeSuggestionIndex] ?? suggestions[0]!);
            setIsOpen(false);
            setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
          }
        }}
      />
      {showSuggestions ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-20 max-h-[18rem] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]"
        >
          {suggestions.map((supplier, index) => {
            const supplierLabel = formatSupplierOptionLabel(supplier);
            const isActive = index === activeSuggestionIndex;

            return (
              <button
                key={supplier.id}
                ref={(element) => {
                  suggestionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isActive}
                title={supplierLabel}
                className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left transition ${
                  isActive ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]"
                }`}
                onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(supplier);
                  setIsOpen(false);
                  setHighlightedSuggestionIndex(getPurchaseDraftInitialSuggestionIndex(0));
                }}
              >
                <span className="min-w-0 truncate font-medium text-[var(--text-strong)]">
                  {supplierLabel}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PurchaseDraftRowEditor({
  row,
  disabled,
  currencyCode,
  onQueryChange,
  onFieldChange,
  onSelectProduct,
  onDelete,
  onSearchProducts,
}: {
  row: PurchaseDraftRow;
  disabled: boolean;
  currencyCode: SystemCurrencyCode;
  onQueryChange: (
    clientId: string,
    field: PurchaseAutocompleteField,
    value: string,
  ) => void;
  onFieldChange: (
    clientId: string,
    key: keyof Pick<PurchaseDraftRow, "qty" | "unitCost" | "lotNumber" | "expiryDate">,
    value: string,
  ) => void;
  onSelectProduct: (clientId: string, product: PurchaseLookupProduct) => void;
  onDelete: (clientId: string) => void;
  onSearchProducts: (
    field: PurchaseAutocompleteField,
    query: string,
    signal: AbortSignal,
  ) => Promise<PurchaseLookupProduct[]>;
}) {
  const canDelete = row.productId.trim() !== "";

  return (
    <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(4.8rem,0.38fr)_minmax(6rem,0.48fr)_minmax(0,0.92fr)_minmax(8rem,0.72fr)_auto]">
        <PurchaseAutocompleteInput
          label="SKU / Barcode"
          placeholder="SKU / Barcode"
          value={row.skuQuery}
          field="sku"
          disabled={disabled}
          onChange={(value) => onQueryChange(row.clientId, "sku", value)}
          onSelect={(selectedProduct) => onSelectProduct(row.clientId, selectedProduct)}
          onSearch={onSearchProducts}
        />

        <PurchaseAutocompleteInput
          label="Item name"
          placeholder="Item name"
          value={row.itemQuery}
          field="item"
          disabled={disabled}
          onChange={(value) => onQueryChange(row.clientId, "item", value)}
          onSelect={(selectedProduct) => onSelectProduct(row.clientId, selectedProduct)}
          onSearch={onSearchProducts}
        />

        <div className="min-w-0">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:sr-only">
            Qty
          </p>
          <Input
            className="ims-control-lg"
            type="number"
            min={1}
            placeholder="Qty"
            value={row.qty}
            onChange={(event) => onFieldChange(row.clientId, "qty", event.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:sr-only">
            Cost
          </p>
          <Input
            className="ims-control-lg"
            type="number"
            min={0}
            step={getSystemCurrencyInputStep(currencyCode)}
            placeholder="Cost"
            value={row.unitCost}
            onChange={(event) => onFieldChange(row.clientId, "unitCost", event.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:sr-only">
            Lot number
          </p>
          <Input
            className="ims-control-lg"
            placeholder="Lot number"
            value={row.lotNumber}
            onChange={(event) => onFieldChange(row.clientId, "lotNumber", event.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:sr-only">
            Expiry date
          </p>
          <Input
            className="ims-control-lg"
            type="date"
            value={row.expiryDate}
            onChange={(event) => onFieldChange(row.clientId, "expiryDate", event.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:sr-only">
            Delete
          </p>
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="ims-control-lg w-full rounded-2xl text-rose-300 hover:text-rose-200"
              onClick={() => onDelete(row.clientId)}
              disabled={disabled}
            >
              Delete
            </Button>
          ) : (
            <div className="ims-control-lg flex items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-[var(--control-px)] text-[0.76rem] text-[var(--text-muted)]">
              New
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PurchaseReadOnlyLineTable({
  lines,
  productById,
  currencyCode,
}: {
  lines: InvoiceLineDraft[];
  productById: Map<string, PurchaseLookupProduct>;
  currencyCode: SystemCurrencyCode;
}) {
  const formatMoney = (value: number | null | undefined) =>
    formatSystemCurrency(value, currencyCode);

  return (
    <div className="mt-6 overflow-x-auto rounded-[1.4rem] border border-[var(--line)]">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
          <tr>
            <th className="px-4 py-3 font-semibold">LN</th>
            <th className="px-4 py-3 font-semibold">Barcode</th>
            <th className="px-4 py-3 font-semibold">Item Name</th>
            <th className="px-4 py-3 text-right font-semibold">Qty</th>
            <th className="px-4 py-3 text-right font-semibold">Cost Price</th>
            <th className="px-4 py-3 text-right font-semibold">Amount</th>
            <th className="purchase-invoice-delete-column px-4 py-3 text-right font-semibold">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr className="border-t border-[var(--line)]">
              <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                No invoice items yet.
              </td>
            </tr>
          ) : (
            lines.map((line, index) => {
              const product = productById.get(line.productId);
              return (
                <tr key={line.clientId} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 text-[var(--text-muted)]">{index + 1}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {product?.barcode ?? line.displayBarcode ?? "--"}
                  </td>
                  <td className="px-4 py-3">
                    <PurchaseLineProductDisplay product={product} line={line} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--text-strong)]">
                    {line.qty}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--text-strong)]">
                    {line.unitCost ? formatMoney(Number(line.unitCost)) : "--"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--text-strong)]">
                    {formatMoney(buildLineTotal(line, currencyCode))}
                  </td>
                  <td className="purchase-invoice-delete-column px-4 py-3 text-right">
                    <span className="text-[var(--text-muted)]">--</span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PurchaseInvoicePage({
  transactionId,
  backHref,
  backLabel,
}: {
  transactionId?: string;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const { companyName, currencyCode, role } = useDashboardSession();
  const [suppliers, setSuppliers] = useState<Lookup[]>([]);
  const [products, setProducts] = useState<PurchaseLookupProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("DRAFT");
  const [txNumber, setTxNumber] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [savedLines, setSavedLines] = useState<InvoiceLineDraft[]>([]);
  const [draftRows, setDraftRows] = useState<PurchaseDraftRow[]>([createNextDraftRow()]);
  const purchaseDefaultsCacheRef = useRef(new Map<string, PurchaseDefaultsResponse>());
  const purchaseDefaultsRequestCacheRef = useRef(
    new Map<string, Promise<PurchaseDefaultsResponse | null>>(),
  );
  const productSearchCacheRef = useRef(new Map<string, PurchaseLookupProduct[]>());
  const canPrint = Boolean(transactionId);
  const canEdit = !transactionId || status === "DRAFT";
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const editableLines = useMemo(
    () =>
      draftRows
        .filter((row) => row.productId.trim() !== "")
        .map((row) => {
          const product = productById.get(row.productId);
          return {
            clientId: row.clientId,
            productId: row.productId,
            qty: row.qty,
            unitCost: row.unitCost,
            lotNumber: row.lotNumber,
            expiryDate: row.expiryDate,
            displayCode: product?.sku ?? (row.skuQuery.trim() || null),
            displayName: product?.name ?? (row.itemQuery || null),
            displayBarcode: product?.barcode ?? null,
          } satisfies InvoiceLineDraft;
        }),
    [draftRows, productById],
  );
  const displayLines = canEdit ? editableLines : savedLines;
  const totalQty = useMemo(
    () => displayLines.reduce((total, line) => total + Number(line.qty || 0), 0),
    [displayLines],
  );
  const netAmount = useMemo(
    () =>
      roundSystemCurrencyValue(
        displayLines.reduce(
          (total, line) => total + buildLineTotal(line, currencyCode),
          0,
        ),
        currencyCode,
      ),
    [currencyCode, displayLines],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError(null);
      productSearchCacheRef.current.clear();

      const suppliersRequest = fetchJson<{ items?: Lookup[] }>("/api/suppliers", {
        fallbackError: "Failed to load suppliers.",
      });
      const detailRequest = transactionId
        ? fetchJson<TransactionDetailResponse>(`/api/transactions/${transactionId}`, {
            fallbackError: "Failed to load purchase invoice.",
          })
        : null;
      const suppliersResult = await suppliersRequest;

      if (cancelled) {
        return;
      }

      if (!suppliersResult.ok) {
        setError(suppliersResult.error);
        setLoading(false);
        return;
      }

      setSuppliers(suppliersResult.data.items ?? []);

      if (!transactionId) {
        setProducts([]);
        setSavedLines([]);
        setSupplierId("");
        setSupplierQuery("");
        setDraftRows([createNextDraftRow()]);
        setLoading(false);
        return;
      }

      const detailResult = await detailRequest!;

      if (cancelled) {
        return;
      }

      if (!detailResult.ok) {
        setError(detailResult.error);
        setLoading(false);
        return;
      }

      const item = detailResult.data.item;
      if (item.type !== "RECEIPT") {
        setError("This page only supports purchase invoices.");
        setLoading(false);
        return;
      }

      const invoiceLines = item.lines.map(createInvoiceLineDraft);
      const lineProducts = invoiceLines
        .map(createLookupProductFromInvoiceLine)
        .filter((product): product is PurchaseLookupProduct => product !== null);
      const productLookup = new Map(lineProducts.map((product) => [product.id, product]));
      const editableDraftRows = ensureTrailingBlankPurchaseDraftRow(
        invoiceLines.map((line) =>
          createDraftRowFromInvoiceLine(line, productLookup.get(line.productId)),
        ),
        createNextDraftRow,
      );

      setProducts(lineProducts);
      setStatus(item.status);
      setTxNumber(item.tx_number);
      setSupplierId(item.supplier?.id ?? "");
      setSupplierQuery(
        item.supplier?.name
          ? formatSupplierOptionLabel({
              name: item.supplier.name,
              code: item.supplier.code,
            })
          : "",
      );
      setSupplierInvoiceNumber(item.supplier_invoice_number ?? "");
      setSupplierInvoiceDate(formatDateInput(item.supplier_invoice_date || item.created_at));
      setNotes(item.notes ?? "");
      setSavedLines(invoiceLines);
      setDraftRows(editableDraftRows);
      setLoading(false);
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  function registerProducts(productsToMerge: PurchaseLookupProduct[]) {
    if (productsToMerge.length === 0) {
      return;
    }

    setProducts((current) => mergeLookupProducts(current, productsToMerge));
  }

  async function loadProductSuggestions(
    field: PurchaseAutocompleteField,
    query: string,
    signal: AbortSignal,
  ) {
    const normalizedQuery = normalizeSearchInput(query);
    if (normalizedQuery.length < PURCHASE_DRAFT_MATCH_MIN_QUERY_LENGTH) {
      return [];
    }

    const cacheKey = buildPurchaseLookupCacheKey(field, normalizedQuery);
    const cached = productSearchCacheRef.current.get(cacheKey);
    if (cached) {
      registerProducts(cached);
      return cached;
    }

    const params = new URLSearchParams({
      q: normalizedQuery,
      field,
      limit: String(PURCHASE_DRAFT_MATCH_LIMIT),
    });
    const result = await fetchJson<PurchaseLookupResponse>(
      `/api/products/lookup?${params.toString()}`,
      {
        fallbackError: "Failed to load product suggestions.",
        signal,
      },
    );

    if (signal.aborted || (!result.ok && result.error === "Request aborted.")) {
      return [];
    }

    if (!result.ok) {
      setError(result.error);
      return [];
    }

    const items = result.data.items ?? [];
    productSearchCacheRef.current.set(cacheKey, items);
    registerProducts(items);
    return items;
  }

  function handleSupplierQueryChange(value: string) {
    setError(null);
    setSupplierQuery(value);

    if (!supplierId) {
      return;
    }

    const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
    const selectedValue = selectedSupplier
      ? formatSupplierOptionLabel(selectedSupplier)
      : supplierQuery;

    if (normalizeComparableText(value) !== normalizeComparableText(selectedValue)) {
      setSupplierId("");
    }
  }

  function handleSelectSupplier(supplier: Lookup) {
    setError(null);
    setSupplierId(supplier.id);
    setSupplierQuery(formatSupplierOptionLabel(supplier));
  }

  async function loadPurchaseDefaults(productId: string) {
    const cached = purchaseDefaultsCacheRef.current.get(productId);
    if (cached) {
      return cached;
    }

    const inFlight = purchaseDefaultsRequestCacheRef.current.get(productId);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      const result = await fetchJson<PurchaseDefaultsResponse>(
        `/api/products/${productId}/purchase-defaults`,
        { fallbackError: "Failed to load last purchase cost." },
      );

      if (!result.ok) {
        setError(result.error);
        return null;
      }

      purchaseDefaultsCacheRef.current.set(productId, result.data);
      return result.data;
    })();

    purchaseDefaultsRequestCacheRef.current.set(productId, request);
    try {
      return await request;
    } finally {
      purchaseDefaultsRequestCacheRef.current.delete(productId);
    }
  }

  function handleDraftQueryChange(
    clientId: string,
    field: PurchaseAutocompleteField,
    value: string,
  ) {
    setError(null);
    setDraftRows((current) =>
      current.map((row) => {
        if (row.clientId !== clientId) {
          return row;
        }

        const selectedProduct = row.productId ? productById.get(row.productId) : undefined;
        const nextRow = {
          ...row,
          [field === "sku" ? "skuQuery" : "itemQuery"]: value,
        };

        if (!row.productId) {
          return nextRow;
        }

        const selectedValue =
          field === "sku"
            ? getPurchaseDraftEditorSku(selectedProduct, row.skuQuery)
            : selectedProduct?.name ?? row.itemQuery;

        if (normalizeComparableText(value) === normalizeComparableText(selectedValue)) {
          return nextRow;
        }

        return {
          ...nextRow,
          productId: "",
        };
      }),
    );
  }

  function handleDraftFieldChange(
    clientId: string,
    key: keyof Pick<PurchaseDraftRow, "qty" | "unitCost" | "lotNumber" | "expiryDate">,
    value: string,
  ) {
    setDraftRows((current) =>
      current.map((row) =>
        row.clientId === clientId ? { ...row, [key]: value } : row,
      ),
    );
  }

  async function handleSelectProduct(clientId: string, product: PurchaseLookupProduct) {
    setError(null);
    registerProducts([product]);

    setDraftRows((current) => {
      const shouldAppendBlank = current[current.length - 1]?.clientId === clientId;
      const nextRows = current.map((row) => {
        if (row.clientId !== clientId) {
          return row;
        }

        return {
          ...row,
          productId: product.id,
          skuQuery: getPurchaseDraftEditorSku(product),
          itemQuery: product.name,
          qty: row.qty.trim() || "1",
        };
      });

      if (!shouldAppendBlank) {
        return nextRows;
      }

      return [...nextRows, createNextDraftRow()];
    });

    const defaults = await loadPurchaseDefaults(product.id);
    if (!defaults) {
      return;
    }

    setDraftRows((current) =>
      current.map((row) =>
        row.clientId === clientId && row.productId === product.id
          ? {
              ...row,
              unitCost:
                defaults.last_unit_cost == null ? "" : String(defaults.last_unit_cost),
            }
          : row,
      ),
    );
  }

  function handleDeleteDraftRow(clientId: string) {
    setDraftRows((current) =>
      ensureTrailingBlankPurchaseDraftRow(
        current.filter((row) => row.clientId !== clientId),
        createNextDraftRow,
      ),
    );
  }

  function buildPayload() {
    if (!supplierId) {
      return { error: "Supplier is required." } as const;
    }

    if (!supplierInvoiceNumber.trim()) {
      return { error: "Voucher number is required." } as const;
    }

    const normalizedLinesResult = buildPurchaseDraftPayloadLines(
      draftRows,
      currencyCode,
    );
    if (normalizedLinesResult.error) {
      return { error: normalizedLinesResult.error } as const;
    }

    if (normalizedLinesResult.lines.length === 0) {
      return { error: "Add at least one line item." } as const;
    }

    return {
      error: null,
      payload: {
        type: "RECEIPT" as const,
        source_location_id: null,
        destination_location_id: null,
        supplier_id: supplierId,
        supplier_invoice_number: supplierInvoiceNumber.trim(),
        supplier_invoice_date: supplierInvoiceDate || null,
        notes: notes.trim() || null,
        lines: normalizedLinesResult.lines,
      },
    } as const;
  }

  async function saveInvoice() {
    const payloadResult = buildPayload();
    if (payloadResult.error) {
      setError(payloadResult.error);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<{ id: string }>(
      transactionId ? `/api/transactions/${transactionId}` : "/api/transactions",
      {
        method: transactionId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadResult.payload),
        fallbackError: transactionId
          ? "Failed to update purchase invoice."
          : "Failed to save purchase invoice.",
      },
    );

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!transactionId) {
      router.replace(`/transactions/purchase/${result.data.id}`);
      return;
    }

    setSavedLines(editableLines);
    setMessage("Purchase invoice saved. Stock and cost updated immediately.");
  }

  async function runStatusAction(action: "post" | "unpost") {
    if (!transactionId) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<{ success?: boolean }>(
      `/api/transactions/${transactionId}/${action}`,
      {
        method: "POST",
        fallbackError:
          action === "post"
            ? "Failed to post purchase invoice."
            : "Failed to unpost purchase invoice.",
      },
    );

    setActionLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
    setStatus(action === "post" ? "POSTED" : "DRAFT");
    setMessage(
      action === "post"
        ? "Purchase invoice finalized."
        : "Purchase invoice reopened. Stock and cost remain applied.",
    );
  }

  async function deleteInvoice() {
    if (!transactionId) {
      router.push(backHref);
      return;
    }

    if (!window.confirm("Delete this invoice?")) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<{ success?: boolean }>(
      `/api/transactions/${transactionId}`,
      {
        method: "DELETE",
        fallbackError: "Failed to delete purchase invoice.",
      },
    );

    setActionLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(backHref);
  }

  return (
    <div className="purchase-invoice-page space-y-6">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        .purchase-invoice-print-lines {
          display: none;
        }

        @media print {
          html,
          body,
          .ims-page,
          .ims-dashboard-shell,
          .ims-content {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .purchase-invoice-page,
          .purchase-invoice-page * {
            visibility: visible !important;
          }

          .purchase-invoice-page {
            position: absolute !important;
            inset: 0 !important;
            z-index: 9999 !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          .purchase-invoice-toolbar,
          .purchase-invoice-editor,
          .purchase-invoice-actions,
          .purchase-invoice-delete-column {
            display: none !important;
          }

          .purchase-invoice-document {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .purchase-invoice-print-meta {
            display: block !important;
          }

          .purchase-invoice-print-header-grid {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 0.75rem !important;
            align-items: end !important;
          }

          .purchase-invoice-print-summary {
            display: grid !important;
            grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr) !important;
            gap: 0.75rem !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .purchase-invoice-print-totals-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .purchase-invoice-document .ims-control-lg {
            min-height: 2.85rem !important;
          }

          .purchase-invoice-print-notes textarea {
            min-height: 4.5rem !important;
            height: auto !important;
            overflow: visible !important;
            resize: none !important;
          }

          .purchase-invoice-document thead {
            display: table-header-group;
          }

          .purchase-invoice-print-lines {
            display: block !important;
          }
        }
      `}</style>

      <header className="purchase-invoice-toolbar flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ims-kicker">Transactions</p>
          <h1 className="ims-title">
            {transactionId ? "Purchase Invoice" : "New Purchase Invoice"}
          </h1>
          <p className="ims-subtitle">
            Build a multi-line supplier invoice. Saving updates stock and cost immediately, and posting finalizes the invoice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={backHref}
            className="inline-flex ims-control-md items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            {backLabel}
          </Link>
        </div>
      </header>

      {error ? <p className="ims-alert-danger">{error}</p> : null}
      {message ? <p className="ims-alert-success">{message}</p> : null}

      {loading ? (
        <Card className="min-h-[24rem]">
          <p className="ims-kicker">Loading</p>
          <div className="mt-4 space-y-3">
            <div className="ims-skeleton h-10 w-64" />
            <div className="ims-skeleton h-28 w-full" />
            <div className="ims-skeleton h-64 w-full" />
          </div>
        </Card>
      ) : null}

      {!loading ? (
        <article className="purchase-invoice-document rounded-[1.8rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
          <div className="border-b border-[var(--line)] pb-5">
            <div>
              <p className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                {companyName}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
                Purchase Invoice
              </h2>
              <p className="purchase-invoice-print-meta mt-2 text-sm text-[var(--text-muted)]">
                {txNumber ? `System No ${txNumber}` : "Not saved yet"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
            <div className="purchase-invoice-print-header-grid grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
              <label className="min-w-0 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Warehouse
                </span>
                <div
                  title={MAIN_WAREHOUSE_NAME}
                  className="ims-control-lg flex items-center rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--text-strong)]"
                >
                  <span className="min-w-0 truncate">{MAIN_WAREHOUSE_NAME}</span>
                </div>
              </label>

              <label className="min-w-0 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Voucher Date
                </span>
                <Input
                  type="date"
                  className="ims-control-lg"
                  value={supplierInvoiceDate}
                  onChange={(event) => setSupplierInvoiceDate(event.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <label className="min-w-0 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Supplier
                </span>
                <PurchaseSupplierInput
                  value={supplierQuery}
                  suppliers={suppliers}
                  disabled={!canEdit}
                  onChange={handleSupplierQueryChange}
                  onSelect={handleSelectSupplier}
                />
              </label>

              <label className="min-w-0 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Voucher No
                </span>
                <Input
                  className="ims-control-lg"
                  value={supplierInvoiceNumber}
                  onChange={(event) => setSupplierInvoiceNumber(event.target.value)}
                  placeholder="Supplier invoice number"
                  disabled={!canEdit}
                />
              </label>
            </div>

          </div>

          {canEdit ? (
            <>
              <div className="purchase-invoice-editor mt-6 rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
                <div className="hidden gap-3 pb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(4.8rem,0.38fr)_minmax(6rem,0.48fr)_minmax(0,0.92fr)_minmax(8rem,0.72fr)_auto]">
                  <span>SKU / Barcode</span>
                  <span>Item name</span>
                  <span>Qty</span>
                  <span>Cost</span>
                  <span>Lot number</span>
                  <span>Expiry date</span>
                  <span>Delete</span>
                </div>
                <div className="space-y-3">
                  {draftRows.map((row) => (
                    <PurchaseDraftRowEditor
                      key={row.clientId}
                      row={row}
                      disabled={!canEdit}
                      currencyCode={currencyCode}
                      onQueryChange={handleDraftQueryChange}
                      onFieldChange={handleDraftFieldChange}
                      onSelectProduct={handleSelectProduct}
                      onDelete={handleDeleteDraftRow}
                      onSearchProducts={loadProductSuggestions}
                    />
                  ))}
                </div>
                <p className="mt-4 text-sm text-[var(--text-muted)]">
                  Type at least three letters in item name or SKU / barcode, then use click or arrow keys with Enter to choose a suggestion. Saving applies stock and cost immediately, and posting only finalizes the invoice.
                </p>
              </div>
              <div className="purchase-invoice-print-lines">
                <PurchaseReadOnlyLineTable
                  lines={editableLines}
                  productById={productById}
                  currencyCode={currencyCode}
                />
              </div>
            </>
          ) : (
            <PurchaseReadOnlyLineTable
              lines={savedLines}
              productById={productById}
              currencyCode={currencyCode}
            />
          )}

          <div className="purchase-invoice-print-summary mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="purchase-invoice-print-notes rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Notes
                </span>
                <textarea
                  className="min-h-32 w-full rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/30"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Additional invoice notes"
                  disabled={!canEdit}
                />
              </label>
            </div>
            <div className="rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Totals
              </p>
              <div className="purchase-invoice-print-totals-grid mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.78fr)_minmax(0,0.82fr)_minmax(0,1.15fr)]">
                <div className="min-w-0 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <span className="text-sm text-[var(--text-muted)]">Item Count</span>
                  <span className="font-medium text-[var(--text-strong)]">{displayLines.length}</span>
                </div>
                <div className="min-w-0 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <span className="text-sm text-[var(--text-muted)]">Total Qty</span>
                  <span className="font-medium text-[var(--text-strong)]">{totalQty}</span>
                </div>
                <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <span className="text-sm text-[var(--text-muted)]">Net Amount</span>
                  <div className="mt-1 min-w-0 sm:text-right">
                    <PurchaseResponsiveCurrencyValue
                      value={netAmount}
                      currencyCode={currencyCode}
                      align="end"
                      emphasized
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="purchase-invoice-actions mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-5">
            {canEdit ? (
              <Button
                type="button"
                className="ims-control-lg rounded-2xl"
                onClick={saveInvoice}
                disabled={saving || actionLoading}
              >
                {saving ? "Saving..." : transactionId ? "Update" : "Save"}
              </Button>
            ) : null}
            {transactionId && status === "DRAFT" ? (
              <Button
                type="button"
                variant="secondary"
                className="ims-control-lg rounded-2xl"
                onClick={() => runStatusAction("post")}
                disabled={saving || actionLoading}
              >
                {actionLoading ? "Posting..." : "Post"}
              </Button>
            ) : null}
            {transactionId && status === "POSTED" && role === "admin" ? (
              <Button
                type="button"
                variant="secondary"
                className="ims-control-lg rounded-2xl"
                onClick={() => runStatusAction("unpost")}
                disabled={saving || actionLoading}
              >
                {actionLoading ? "Unposting..." : "Unpost"}
              </Button>
            ) : null}
            {transactionId && status === "DRAFT" ? (
              <Button
                type="button"
                variant="ghost"
                className="ims-control-lg rounded-2xl text-rose-300 hover:text-rose-200"
                onClick={deleteInvoice}
                disabled={saving || actionLoading}
              >
                Delete
              </Button>
            ) : null}
            {canPrint ? (
              <Button
                type="button"
                variant="secondary"
                className="ims-control-lg rounded-2xl"
                onClick={() => window.print()}
              >
                Print
              </Button>
            ) : null}
            <Link
              href={backHref}
              className="inline-flex ims-control-lg items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[var(--text-strong)] transition hover:bg-[var(--surface-muted)]"
            >
              Cancel
            </Link>
          </div>
        </article>
      ) : null}
    </div>
  );
}
