import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type Tone = "default" | "warn" | "danger" | "success";

const toneClass: Record<Tone, string> = {
  default:
    "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-strong)]",
  warn: "border border-transparent bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  danger:
    "border border-transparent bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  success:
    "border border-transparent bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
