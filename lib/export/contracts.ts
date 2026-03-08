export type ExportFormat = "csv" | "xlsx" | "pdf" | "print";

export type ExportColumn = {
  key: string;
  label: string;
};

export type ExportRow = Record<string, unknown>;

export type ExportDataset = {
  title: string;
  filenameBase: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  filterSummary?: string[];
  emptyMessage?: string;
  printOrientation?: "portrait" | "landscape";
};
