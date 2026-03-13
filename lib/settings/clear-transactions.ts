export const CLEAR_TRANSACTIONS_CONFIRMATION = "CLEAR TRANSACTIONS";

export const CLEAR_TRANSACTIONS_COUNT_KEYS = [
  "supplier_document_payments",
  "supplier_documents",
  "stock_ledger",
  "inventory_transaction_lines",
  "transfer_lines",
  "transfers",
  "inventory_transactions",
  "inventory_batches",
  "alerts",
] as const;

export type ClearTransactionsCountKey =
  (typeof CLEAR_TRANSACTIONS_COUNT_KEYS)[number];
