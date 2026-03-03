import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type Tone = "default" | "subtle" | "elevated";

const toneClass: Record<Tone, string> = {
  default:
    "border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)]",
  subtle:
    "border-[var(--line)] bg-[var(--surface-muted)] shadow-[var(--shadow-sm)]",
  elevated:
    "border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)]",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Card({ className, tone = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border p-[var(--space-5)]",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
