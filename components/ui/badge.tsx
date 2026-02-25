import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type Tone = "default" | "warn" | "danger" | "success";

const toneClass: Record<Tone, string> = {
  default: "bg-slate-100 text-slate-800",
  warn: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-900",
  success: "bg-emerald-100 text-emerald-900",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
