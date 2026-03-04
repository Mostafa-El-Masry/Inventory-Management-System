export type Role = "admin" | "manager" | "staff";

export type TransactionType =
  | "RECEIPT"
  | "ISSUE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "ADJUSTMENT"
  | "RETURN_IN"
  | "RETURN_OUT"
  | "CYCLE_COUNT"
  | "REVERSAL";

export type TransactionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "POSTED"
  | "REVERSED"
  | "CANCELLED";

export type TransferStatus =
  | "REQUESTED"
  | "APPROVED"
  | "DISPATCHED"
  | "RECEIVED"
  | "REJECTED"
  | "CANCELLED";

export type AlertType = "LOW_STOCK" | "EXPIRY";

export type AlertSeverity = "INFO" | "WARN" | "CRITICAL";

export type SupplierDocumentType = "INVOICE" | "CREDIT_NOTE";
export type SupplierDocumentStatus = "OPEN" | "VOID";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  is_active: boolean;
  category_id: string | null;
  subcategory_id: string | null;
  category_name?: string | null;
  subcategory_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductLocationPolicy {
  id: string;
  product_id: string;
  location_id: string;
  min_qty: number;
  max_qty: number;
  reorder_qty: number;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierDocument {
  id: string;
  supplier_id: string;
  location_id: string;
  source_transaction_id: string | null;
  document_type: SupplierDocumentType;
  document_number: string;
  document_date: string;
  currency: string;
  gross_amount: number;
  status: SupplierDocumentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransactionLineInput {
  product_id: string;
  qty: number;
  unit_cost?: number | null;
  lot_number?: string | null;
  expiry_date?: string | null;
  reason_code?: string | null;
}

export interface DashboardMetrics {
  totalSkus: number;
  lowStockCount: number;
  expiringSoonCount: number;
  transferSummary: Record<TransferStatus, number>;
  recentTransactions: Array<{
    id: string;
    tx_number: string;
    type: TransactionType;
    status: TransactionStatus;
    created_at: string;
  }>;
}
