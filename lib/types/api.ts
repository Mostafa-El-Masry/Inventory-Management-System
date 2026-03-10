import type { MasterPermissions } from "@/lib/master-permissions";

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
