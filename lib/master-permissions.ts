export const MASTER_PERMISSION_MODEL = {
  suppliers: ["create", "import", "edit", "archive", "delete"],
  locations: ["create", "import", "archive"],
  products: ["create", "import", "archive", "delete"],
  categories: ["create", "import", "archive", "delete"],
  subcategories: ["create", "import", "archive", "delete"],
} as const;

export const MASTER_PERMISSION_ACTION_ORDER = [
  "create",
  "import",
  "edit",
  "archive",
  "delete",
] as const;

export const MASTER_PERMISSION_ENTITY_LABELS = {
  suppliers: "Suppliers",
  locations: "Locations",
  products: "Products",
  categories: "Categories",
  subcategories: "Subcategories",
} as const;

export const MASTER_PERMISSION_ACTION_LABELS = {
  create: "Create",
  import: "Import",
  edit: "Edit",
  archive: "Archive",
  delete: "Delete",
} as const;

export const PROFILE_SELECT_BASE =
  "id, full_name, role, is_active, created_at, updated_at";
export const PROFILE_SELECT_WITH_MASTER_PERMISSIONS = `${PROFILE_SELECT_BASE}, master_permissions`;

export type MasterPermissionEntity = keyof typeof MASTER_PERMISSION_MODEL;
export type MasterPermissionGridAction =
  (typeof MASTER_PERMISSION_ACTION_ORDER)[number];
export type MasterPermissionAction<E extends MasterPermissionEntity> =
  (typeof MASTER_PERMISSION_MODEL)[E][number];
export type MasterPermissionRole = "admin" | "manager" | "staff";

export type MasterPermissions = {
  [Entity in MasterPermissionEntity]: {
    [Action in MasterPermissionAction<Entity>]: boolean;
  };
};

export type RawMasterPermissions = {
  [Entity in MasterPermissionEntity]?: Partial<MasterPermissions[Entity]>;
};

const MASTER_PERMISSION_ENTITIES = Object.keys(
  MASTER_PERMISSION_MODEL,
) as MasterPermissionEntity[];

function buildEntityPermissions<Entity extends MasterPermissionEntity>(
  entity: Entity,
  fill: boolean,
): MasterPermissions[Entity] {
  const entityPermissions = {} as Record<string, boolean>;

  for (const action of MASTER_PERMISSION_MODEL[entity]) {
    entityPermissions[action] = fill;
  }

  return entityPermissions as MasterPermissions[Entity];
}

function buildMasterPermissions(fill: boolean) {
  return {
    suppliers: buildEntityPermissions("suppliers", fill),
    locations: buildEntityPermissions("locations", fill),
    products: buildEntityPermissions("products", fill),
    categories: buildEntityPermissions("categories", fill),
    subcategories: buildEntityPermissions("subcategories", fill),
  } satisfies MasterPermissions;
}

export function createEmptyMasterPermissions() {
  return buildMasterPermissions(false);
}

export function createFullMasterPermissions() {
  return buildMasterPermissions(true);
}

export function normalizeMasterPermissions(
  input: unknown,
  role?: MasterPermissionRole | null,
) {
  if (role === "admin") {
    return createFullMasterPermissions();
  }

  const normalized = createEmptyMasterPermissions();
  if (!input || typeof input !== "object") {
    return normalized;
  }

  const rawPermissions = input as Record<string, unknown>;

  for (const entity of MASTER_PERMISSION_ENTITIES) {
    const rawEntity = rawPermissions[entity];
    if (!rawEntity || typeof rawEntity !== "object") {
      continue;
    }

    const normalizedEntity = normalized[entity] as Record<string, boolean>;
    const rawEntityPermissions = rawEntity as Record<string, unknown>;
    for (const action of MASTER_PERMISSION_MODEL[entity]) {
      normalizedEntity[action] = rawEntityPermissions[action] === true;
    }
  }

  return normalized;
}

export function serializeMasterPermissions(
  input: unknown,
  role?: MasterPermissionRole | null,
) {
  if (role === "admin") {
    return {} as RawMasterPermissions;
  }

  const normalized = normalizeMasterPermissions(input);
  const serialized: RawMasterPermissions = {};

  for (const entity of MASTER_PERMISSION_ENTITIES) {
    const normalizedEntity = normalized[entity] as Record<string, boolean>;
    const entityPermissions = {} as Record<string, boolean>;
    let hasEnabledAction = false;

    for (const action of MASTER_PERMISSION_MODEL[entity]) {
      if (!normalizedEntity[action]) {
        continue;
      }

      entityPermissions[action] = true;
      hasEnabledAction = true;
    }

    if (hasEnabledAction) {
      serialized[entity] = entityPermissions as Partial<MasterPermissions[typeof entity]>;
    }
  }

  return serialized;
}

export function supportsMasterPermissionAction(
  entity: MasterPermissionEntity,
  action: MasterPermissionGridAction,
) {
  return (MASTER_PERMISSION_MODEL[entity] as readonly string[]).includes(action);
}

export function hasMasterPermission<Entity extends MasterPermissionEntity>(
  permissions: MasterPermissions,
  entity: Entity,
  action: MasterPermissionAction<Entity>,
) {
  return permissions[entity][action];
}

export function hasAnyMasterPermission<Entity extends MasterPermissionEntity>(
  permissions: MasterPermissions,
  entity: Entity,
  actions?: readonly MasterPermissionAction<Entity>[],
) {
  const permissionActions =
    actions ?? (MASTER_PERMISSION_MODEL[entity] as readonly MasterPermissionAction<Entity>[]);

  return permissionActions.some((action) => permissions[entity][action]);
}

export function isMissingMasterPermissionsColumnError(
  error:
    | {
        code?: string | null;
        message?: string | null;
        details?: string | null;
        hint?: string | null;
      }
    | null
    | undefined,
) {
  if (!error) {
    return false;
  }

  const haystack = [
    error.code ?? "",
    error.message ?? "",
    error.details ?? "",
    error.hint ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("master_permissions") &&
    (haystack.includes("column") ||
      haystack.includes("schema cache") ||
      haystack.includes("pgrst204") ||
      haystack.includes("42703"))
  );
}
