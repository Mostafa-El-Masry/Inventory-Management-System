import type { SortDirection } from "@/components/master/sortable-table-header";

function normalizeSortValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value).trim().toLowerCase();
}

export function compareTextValues(
  left: unknown,
  right: unknown,
  direction: SortDirection,
) {
  const result = normalizeSortValue(left).localeCompare(normalizeSortValue(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? result : -result;
}
