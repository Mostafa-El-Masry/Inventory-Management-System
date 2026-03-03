import { Role } from "@/lib/types/domain";

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export type UserProvisionMode = "invite" | "password";

export interface AuthCapabilities {
  canManageUsers: boolean;
  canCreateProductMaster: boolean;
  canEditProductMaster: boolean;
  canArchiveProducts: boolean;
  canManageLocations: boolean;
  canArchiveLocations: boolean;
}

export interface AuthMeResponse {
  user_id: string;
  role: Role;
  is_active: boolean;
  location_ids: string[];
  capabilities: AuthCapabilities;
}
