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
        "relative inline-flex h-[var(--control-h-md)] min-w-[8rem] items-center rounded-full border-0 px-3 text-[var(--control-font-size)] font-semibold shadow-none transition focus-visible:ring-[var(--brand-primary)]",
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
          "absolute inset-y-[0.225rem] flex w-[calc(var(--control-h-md)-0.45rem)] items-center justify-center rounded-full bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-[left,right,color] duration-300",
          pressed
            ? "left-1.5 right-auto text-[var(--brand-primary-hover)]"
            : "left-auto right-1.5 text-[var(--text-muted)]",
        )}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      <span
        className={cn(
          "relative z-10 block w-full truncate transition-[padding,text-align] duration-300",
          pressed ? "pl-[2.9rem] pr-0 text-right" : "pl-0 pr-[2.9rem] text-left",
        )}
      >
        {label}
      </span>
    </Button>
  );
}
