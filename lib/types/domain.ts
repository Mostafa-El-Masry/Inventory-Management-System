import type { MasterPermissions } from "@/lib/master-permissions";

export type Role = "admin" | "manager" | "staff";

export type TransactionType =
  | "RECEIPT"
  | "ISSUE"
  | "CONSUMPTION"
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

export type SupplierDocumentType = "INVOICE" | "CREDIT_NOTE";
export type SupplierDocumentStatus = "OPEN" | "VOID";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  master_permissions: MasterPermissions;
}
