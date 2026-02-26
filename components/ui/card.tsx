import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type Tone = "default" | "subtle" | "elevated";

const toneClass: Record<Tone, string> = {
  default:
    "border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
  subtle:
    "border-[var(--border-subtle)] bg-[var(--bg-subtle)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
  elevated:
    "border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[0_12px_28px_rgba(16,17,20,0.08)]",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Card({ className, tone = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
