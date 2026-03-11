"use client";

import { useEffect, useReducer, useRef, useState, type CSSProperties } from "react";

import { MasterArchivedToggle } from "@/components/master/master-archived-toggle";
import { MasterColumnsMenu } from "@/components/master/master-columns-menu";
import { Button } from "@/components/ui/button";
import { ExportActions } from "@/components/ui/export-actions";
import type { ExportColumn, ExportRow } from "@/lib/export/contracts";
import { cn } from "@/lib/utils/cn";

import type { MasterColumnDefinition } from "./use-master-columns";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SETTINGS_MENU_TRANSITION_MS = 320;
const SETTINGS_MENU_CLOSE_DELAY_MS = 1000;
const SETTINGS_MENU_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

type MenuRevealState = {
  rendered: boolean;
  visible: boolean;
};

type MenuRevealAction =
  | {
      type: "sync";
      open: boolean;
      prefersReduced: boolean;
    }
  | {
      type: "activate";
    }
  | {
      type: "hide";
    };

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function createInitialMenuRevealState({
  open,
}: {
  open: boolean;
}): MenuRevealState {
  return {
    rendered: open,
    visible: open,
  };
}

function menuRevealReducer(
  state: MenuRevealState,
  action: MenuRevealAction,
): MenuRevealState {
  if (action.type === "sync") {
    if (action.prefersReduced) {
      if (state.rendered === action.open && state.visible === action.open) {
        return state;
      }

      return {
        rendered: action.open,
        visible: action.open,
      };
    }

    if (action.open) {
      if (state.rendered && state.visible) {
        return state;
      }

      return {
        rendered: true,
        visible: false,
      };
    }

    if (!state.rendered) {
      return state;
    }

    return {
      rendered: true,
      visible: false,
    };
  }

  if (action.type === "activate") {
    if (!state.rendered || state.visible) {
      return state;
    }

    return {
      rendered: true,
      visible: true,
    };
  }

  if (!state.rendered) {
    return state;
  }

  return {
    rendered: false,
    visible: false,
  };
}

type MasterListSettingsMenuProps<K extends string> = {
  orderedColumns: readonly MasterColumnDefinition<K>[];
  columnVisibility: Record<K, boolean>;
  onToggleColumn: (columnKey: K) => void;
  onMoveColumn: (columnKey: K, direction: -1 | 1) => void;
  onResetColumns: () => void;
  columnsHelperText?: string;
  showInactive: boolean;
  onShowInactiveChange: (pressed: boolean) => void;
  inactiveLabel?: string;
  exportTitle: string;
  exportFilenameBase: string;
  exportColumns: ExportColumn[];
  exportRows: ExportRow[];
  exportLoadRows?: () => Promise<ExportRow[]>;
  exportFilterSummary?: string[];
  exportEmptyMessage: string;
  className?: string;
};

export function MasterListSettingsMenu<K extends string>({
  orderedColumns,
  columnVisibility,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
  columnsHelperText,
  showInactive,
  onShowInactiveChange,
  inactiveLabel = "Disabled",
  exportTitle,
  exportFilenameBase,
  exportColumns,
  exportRows,
  exportLoadRows,
  exportFilterSummary,
  exportEmptyMessage,
  className,
}: MasterListSettingsMenuProps<K>) {
  const [open, setOpen] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(prefersReducedMotion);
  const [menuState, dispatchMenuState] = useReducer(
    menuRevealReducer,
    { open: false },
    createInitialMenuRevealState,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  function cancelScheduledClose() {
    if (closeTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  }

  function scheduleClose() {
    cancelScheduledClose();
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      setOpen(false);
    }, SETTINGS_MENU_CLOSE_DELAY_MS);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        cancelScheduledClose();
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelScheduledClose();
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = () => {
      setPrefersReduced(mediaQuery.matches);
    };

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    dispatchMenuState({
      type: "sync",
      open,
      prefersReduced,
    });
  }, [open, prefersReduced]);

  useEffect(() => {
    if (prefersReduced || !menuState.rendered) {
      return;
    }

    if (open && !menuState.visible) {
      const frameId = window.requestAnimationFrame(() => {
        dispatchMenuState({ type: "activate" });
      });

      return () => window.cancelAnimationFrame(frameId);
    }

    if (!open && !menuState.visible) {
      const timeoutId = window.setTimeout(() => {
        dispatchMenuState({ type: "hide" });
      }, SETTINGS_MENU_TRANSITION_MS);

      return () => window.clearTimeout(timeoutId);
    }
  }, [open, prefersReduced, menuState.rendered, menuState.visible]);

  const menuStyle: CSSProperties | undefined = prefersReduced
    ? undefined
    : {
        opacity: menuState.visible ? 1 : 0,
        transform: menuState.visible
          ? "translateY(0) scale(1)"
          : "translateY(-0.6rem) scale(0.985)",
        pointerEvents: menuState.visible ? "auto" : "none",
        transition: [
          `opacity ${SETTINGS_MENU_TRANSITION_MS}ms ${SETTINGS_MENU_EASING}`,
          `transform ${SETTINGS_MENU_TRANSITION_MS}ms ${SETTINGS_MENU_EASING}`,
        ].join(", "),
      };

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onMouseEnter={() => {
        cancelScheduledClose();
        setOpen(true);
      }}
      onMouseLeave={() => {
        scheduleClose();
      }}
      onFocusCapture={() => {
        cancelScheduledClose();
        setOpen(true);
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && containerRef.current?.contains(nextTarget)) {
          return;
        }

        scheduleClose();
      }}
    >
      <Button
        variant="secondary"
        className={cn(
          "h-[var(--control-h-md)] w-[var(--control-h-md)] rounded-full border-0 px-0 shadow-none",
          open ? "text-[var(--brand-primary-hover)]" : "",
        )}
        aria-label="Open list settings"
        aria-expanded={open}
        onClick={() => {
          cancelScheduledClose();
          setOpen((current) => !current);
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4.5 w-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3.5v2.25" />
          <path d="M12 18.25v2.25" />
          <path d="M5.64 5.64l1.6 1.6" />
          <path d="M16.76 16.76l1.6 1.6" />
          <path d="M3.5 12h2.25" />
          <path d="M18.25 12h2.25" />
          <path d="M5.64 18.36l1.6-1.6" />
          <path d="M16.76 7.24l1.6-1.6" />
          <circle cx="12" cy="12" r="5.25" />
          <circle cx="12" cy="12" r="2.1" />
        </svg>
      </Button>

      {menuState.rendered ? (
        <div
          className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-[min(12rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] origin-top-right rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2.5 shadow-[var(--shadow-md)] sm:w-[11rem] sm:p-3 md:w-[10.5rem]"
          aria-hidden={!menuState.visible}
          style={menuStyle}
        >
          <div className="mb-1.5 sm:mb-2">
            <p className="text-xs font-semibold text-[var(--text-strong)] sm:text-sm">
              Settings
            </p>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <MasterColumnsMenu
              orderedColumns={orderedColumns}
              columnVisibility={columnVisibility}
              onToggleColumn={onToggleColumn}
              onMoveColumn={onMoveColumn}
              onReset={onResetColumns}
              helperText={columnsHelperText}
              triggerVariant="secondary"
              triggerButtonClassName="rounded-xl !h-10 px-2.5 !text-xs sm:px-3 sm:!text-sm"
            />

            <MasterArchivedToggle
              pressed={showInactive}
              onPressedChange={onShowInactiveChange}
              label={inactiveLabel}
              className="w-full min-w-0 !h-10 px-2.5 !text-xs sm:px-3 sm:!text-sm"
            />

            <ExportActions
              title={exportTitle}
              filenameBase={exportFilenameBase}
              columns={exportColumns}
              rows={exportRows}
              loadRows={exportLoadRows}
              filterSummary={exportFilterSummary}
              emptyMessage={exportEmptyMessage}
              variant="secondary"
              buttonClassName="w-full justify-between rounded-xl !h-10 whitespace-normal px-2.5 py-2 text-left leading-tight !text-xs sm:px-3 sm:!text-sm"
              menuAlign="end"
              menuClassName="min-w-[10rem] max-w-[min(14rem,calc(100vw-1.5rem))]"
              menuItemClassName="px-2.5 py-2 text-xs sm:px-3 sm:text-sm"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
