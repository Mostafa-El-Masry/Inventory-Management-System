"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type MasterArchivedToggleProps = {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
};

export function MasterArchivedToggle({
  pressed,
  onPressedChange,
  label = "Disabled",
  className,
  disabled = false,
}: MasterArchivedToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={pressed}
      aria-label={`${pressed ? "Hide" : "Show"} ${label.toLowerCase()} items`}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-[var(--control-h-md)] min-w-[7.4rem] items-center justify-start rounded-full border-0 px-3 pl-[3.15rem] text-[var(--control-font-size)] font-semibold shadow-none transition focus-visible:ring-[var(--brand-primary)]",
        pressed
          ? "bg-[color:color-mix(in_srgb,var(--brand-primary-soft)_88%,var(--surface)_12%)] text-[var(--brand-primary-hover)] hover:bg-[color:color-mix(in_srgb,var(--brand-primary-soft)_80%,var(--surface)_20%)]"
          : "bg-[var(--surface-soft)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]",
        className,
      )}
      onClick={() => onPressedChange(!pressed)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-1.5 flex h-[calc(var(--control-h-md)-0.45rem)] w-[calc(var(--control-h-md)-0.45rem)] items-center justify-center rounded-full bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-transform duration-300",
          pressed
            ? "translate-x-[3.05rem] text-[var(--brand-primary-hover)]"
            : "translate-x-0 text-[var(--text-muted)]",
        )}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      <span className="truncate">{label}</span>
    </Button>
  );
}
