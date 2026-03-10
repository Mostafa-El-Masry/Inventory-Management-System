"use client";

import {
  MASTER_PERMISSION_ACTION_LABELS,
  MASTER_PERMISSION_ACTION_ORDER,
  MASTER_PERMISSION_ENTITY_LABELS,
  MASTER_PERMISSION_MODEL,
  type MasterPermissionEntity,
  type MasterPermissionGridAction,
  type MasterPermissions,
  supportsMasterPermissionAction,
} from "@/lib/master-permissions";

type MasterPermissionsMatrixProps = {
  value: MasterPermissions;
  onToggle: (
    entity: MasterPermissionEntity,
    action: MasterPermissionGridAction,
  ) => void;
  disabled?: boolean;
};

export function MasterPermissionsMatrix({
  value,
  onToggle,
  disabled = false,
}: MasterPermissionsMatrixProps) {
  const entities = Object.keys(MASTER_PERMISSION_MODEL) as MasterPermissionEntity[];

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-left text-[0.68rem] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <th className="px-3 py-2 font-semibold">Area</th>
            {MASTER_PERMISSION_ACTION_ORDER.map((action) => (
              <th key={action} className="px-2 py-2 text-center font-semibold">
                {MASTER_PERMISSION_ACTION_LABELS[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={entity} className="border-t border-[var(--line)] first:border-t-0">
              <th className="px-3 py-2 text-left font-medium text-[var(--text-strong)]">
                {MASTER_PERMISSION_ENTITY_LABELS[entity]}
              </th>
              {MASTER_PERMISSION_ACTION_ORDER.map((action) => {
                const supported = supportsMasterPermissionAction(entity, action);
                if (!supported) {
                  return (
                    <td key={`${entity}-${action}`} className="px-2 py-2 text-center">
                      <span className="text-xs text-[var(--text-muted)]">--</span>
                    </td>
                  );
                }

                const pressed = Boolean((value[entity] as Record<string, boolean>)[action]);

                return (
                  <td key={`${entity}-${action}`} className="px-2 py-2 text-center">
                    <button
                      type="button"
                      aria-pressed={pressed}
                      aria-label={`${pressed ? "Disable" : "Enable"} ${MASTER_PERMISSION_ACTION_LABELS[action]} for ${MASTER_PERMISSION_ENTITY_LABELS[entity]}`}
                      className={`min-w-[3.1rem] rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        pressed
                          ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary-hover)]"
                          : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)]"
                      } ${
                        disabled
                          ? "cursor-not-allowed opacity-60"
                          : "hover:border-[var(--brand-primary)] hover:text-[var(--text-strong)]"
                      }`}
                      disabled={disabled}
                      onClick={() => onToggle(entity, action)}
                    >
                      {pressed ? "On" : "Off"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
