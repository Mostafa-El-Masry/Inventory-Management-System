import type { MasterPermissions } from "@/lib/master-permissions";
import type { SystemCurrencyCode } from "@/lib/settings/system-currency";
import type { ClearTransactionsCountKey } from "@/lib/settings/clear-transactions";

export interface AuthCapabilities {
  canManageUsers: boolean;
  canCreateProductMaster: boolean;
  canEditProductMaster: boolean;
  canArchiveProducts: boolean;
  canManageLocations: boolean;
  canArchiveLocations: boolean;
  canManageSuppliers: boolean;
  canManageSystemSettings: boolean;
  canRecordSupplierPayments: boolean;
  master: MasterPermissions;
}

export type SettingsTestActionKind = "purchase" | "transfer" | "consumption";

export type SettingsClearTransactionsCounts = Record<
  ClearTransactionsCountKey,
  number
>;

export interface SettingsClearTransactionsResponse {
  success: boolean;
  counts: SettingsClearTransactionsCounts;
  total_rows_cleared: number;
}

export interface SettingsTestRecordSummary {
  entity: "transaction" | "transfer";
  id: string;
  number: string | null;
  status: string | null;
  transaction_type?: string | null;
}

export interface SettingsTestActionResponse {
  success: boolean;
  kind: SettingsTestActionKind;
  record: SettingsTestRecordSummary;
  steps_completed: string[];
  failed_step?: string;
  error?: string;
  bootstrap_record?: SettingsTestRecordSummary | null;
}

export interface SystemSettingsResponse {
  company_name: string;
  currency_code: SystemCurrencyCode;
}

export interface TransactionLookupSummary {
  id: string;
  code: string | null;
  name: string | null;
}

export interface TransactionLineDetail {
  id: string;
  product_id: string;
  product_display_code: string | null;
  product_display_name: string | null;
  product_barcode: string | null;
  qty: number;
  lot_number: string | null;
  expiry_date: string | null;
  unit_cost: number | null;
  reason_code: string | null;
  line_total: number | null;
}

export interface TransactionDetailRecord {
  id: string;
  tx_number: string;
  type: string;
  status: string;
  created_at: string;
  notes: string | null;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  source_location: TransactionLookupSummary | null;
  destination_location: TransactionLookupSummary | null;
  supplier: TransactionLookupSummary | null;
  lines: TransactionLineDetail[];
  total_qty: number;
  total_cost: number;
}

export interface TransactionDetailResponse {
  item: TransactionDetailRecord;
}

export interface TransferLineDetail {
  id: string;
  product_id: string;
  product_display_code: string | null;
  product_display_name: string | null;
  product_barcode: string | null;
  requested_qty: number;
  dispatched_qty: number;
  received_qty: number;
}

export interface TransferDetailRecord {
  id: string;
  transfer_number: string;
  status: string;
  created_at: string;
  notes: string | null;
  source_location: TransactionLookupSummary | null;
  destination_location: TransactionLookupSummary | null;
  lines: TransferLineDetail[];
  total_requested_qty: number;
  total_dispatched_qty: number;
  total_received_qty: number;
}

export interface TransferDetailResponse {
  item: TransferDetailRecord;
}
