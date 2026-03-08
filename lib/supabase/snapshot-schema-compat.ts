type ErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const SNAPSHOT_COLUMN_NAMES = [
  "supplier_code_snapshot",
  "supplier_name_snapshot",
  "product_sku_snapshot",
  "product_name_snapshot",
  "product_barcode_snapshot",
] as const;

export function isMissingSnapshotColumnError(error: ErrorLike | null | undefined) {
  if (!error) {
    return false;
  }

  const message = [error.message, error.details, error.hint]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return (
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find")) &&
    SNAPSHOT_COLUMN_NAMES.some((column) => message.includes(column))
  );
}

export function stripSnapshotFields<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.endsWith("_snapshot")),
  ) as Partial<T>;
}

export function stripSnapshotFieldsFromRows<T extends Record<string, unknown>>(
  rows: T[],
) {
  return rows.map((row) => stripSnapshotFields(row));
}
