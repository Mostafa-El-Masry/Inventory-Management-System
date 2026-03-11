"use client";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export type RowLimitOption = 10 | 25 | 50 | "all";
const MAX_VISIBLE_PAGE_BUTTONS = 5;

export function parseRowLimitOption(raw: unknown): RowLimitOption {
  if (raw === 10 || raw === "10") {
    return 10;
  }
  if (raw === 25 || raw === "25") {
    return 25;
  }
  if (raw === 50 || raw === "50" || raw === 100 || raw === "100") {
    return 50;
  }
  if (raw === "all") {
    return "all";
  }
  return 10;
}

export function paginateRows<T>(rows: T[], limit: RowLimitOption, page: number) {
  const totalItems = rows.length;
  const totalPages =
    limit === "all" ? 1 : Math.max(1, Math.ceil(totalItems / limit));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  if (limit === "all") {
    return {
      items: rows,
      totalItems,
      totalPages,
      currentPage,
      start: totalItems === 0 ? 0 : 1,
      end: totalItems,
    };
  }

  const startIndex = (currentPage - 1) * limit;
  const items = rows.slice(startIndex, startIndex + limit);

  return {
    items,
    totalItems,
    totalPages,
    currentPage,
    start: totalItems === 0 ? 0 : startIndex + 1,
    end: totalItems === 0 ? 0 : startIndex + items.length,
  };
}

export function buildVisiblePaginationPages(
  totalPages: number,
  currentPage: number,
  maxVisibleButtons = MAX_VISIBLE_PAGE_BUTTONS,
) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), safeTotalPages);
  const targetCount = Math.min(maxVisibleButtons, safeTotalPages);
  const visiblePages = new Set<number>();

  [1, safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, safeTotalPages].forEach(
    (page) => {
      if (page >= 1 && page <= safeTotalPages) {
        visiblePages.add(page);
      }
    },
  );

  let distance = 2;
  while (visiblePages.size < targetCount) {
    const beforePage = safeCurrentPage - distance;
    if (beforePage > 1) {
      visiblePages.add(beforePage);
    }

    if (visiblePages.size >= targetCount) {
      break;
    }

    const afterPage = safeCurrentPage + distance;
    if (afterPage < safeTotalPages) {
      visiblePages.add(afterPage);
    }

    distance += 1;
  }

  return Array.from(visiblePages).sort((left, right) => left - right);
}

type MasterTablePaginationProps = {
  totalItems: number;
  currentPage: number;
  rowLimit: RowLimitOption;
  onPageChange: (page: number) => void;
  loading?: boolean;
};

export function MasterRowLimitControl({
  value,
  onChange,
}: {
  value: RowLimitOption;
  onChange: (limit: RowLimitOption) => void;
}) {
  return (
    <Select
      className="ims-control-sm w-[4.5rem] shrink-0 appearance-none bg-none"
      aria-label="Page size"
      value={String(value)}
      onChange={(event) => onChange(parseRowLimitOption(event.target.value))}
    >
      <option value="10">10</option>
      <option value="25">25</option>
      <option value="50">50</option>
      <option value="all">All</option>
    </Select>
  );
}

export function MasterTablePagination({
  totalItems,
  currentPage,
  rowLimit,
  onPageChange,
  loading = false,
}: MasterTablePaginationProps) {
  const totalPages =
    rowLimit === "all" ? 1 : Math.max(1, Math.ceil(totalItems / rowLimit));
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const start =
    totalItems === 0
      ? 0
      : rowLimit === "all"
        ? 1
        : (safePage - 1) * rowLimit + 1;
  const end =
    totalItems === 0
      ? 0
      : rowLimit === "all"
        ? totalItems
        : Math.min(totalItems, safePage * rowLimit);
  const pages = buildVisiblePaginationPages(totalPages, safePage);

  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {pages.map((page) => (
          <Button
            key={page}
            variant={page === safePage ? "primary" : "secondary"}
            className="ims-control-sm min-w-8 rounded-xl px-2"
            disabled={loading}
            onClick={() => onPageChange(page)}
          >
            {page}
          </Button>
        ))}
      </div>

      <p className="text-center text-xs text-[var(--text-muted)]">
        {loading
          ? "Loading..."
          : totalItems === 0
            ? "No records"
            : `Showing ${start}-${end} of ${totalItems}`}
      </p>
    </div>
  );
}
