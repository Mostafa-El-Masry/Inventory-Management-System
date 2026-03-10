"use client";

import { cn } from "@/lib/utils/cn";

import type { RowLimitOption } from "@/components/master/master-table-pagination";

const MAX_LOADING_ROWS = 10;
const BAR_WIDTHS = ["w-14", "w-20", "w-28", "w-36", "w-24", "w-16"] as const;

function getLoadingRowCount(limit: RowLimitOption) {
  return limit === "all" ? MAX_LOADING_ROWS : Math.min(limit, MAX_LOADING_ROWS);
}

export function MasterTableLoadingRows<K extends string>({
  columns,
  rowLimit,
}: {
  columns: readonly { key: K }[];
  rowLimit: RowLimitOption;
}) {
  const rows = Array.from({ length: getLoadingRowCount(rowLimit) }, (_, index) => index);

  return (
    <tbody aria-busy="true" aria-live="polite">
      {rows.map((rowIndex) => (
        <tr key={`loading-row-${rowIndex}`} className="ims-table-row">
          {columns.map((column, columnIndex) => {
            const isActionColumn = column.key === "action";
            const widthClass = BAR_WIDTHS[(rowIndex + columnIndex) % BAR_WIDTHS.length];

            return (
              <td key={`loading-cell-${rowIndex}-${String(column.key)}`}>
                <div
                  className={cn(
                    "ims-skeleton",
                    isActionColumn ? "h-8 w-8 rounded-full" : `h-4 ${widthClass}`,
                  )}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  );
}
