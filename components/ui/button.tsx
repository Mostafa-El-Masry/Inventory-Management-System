import { ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "danger" | "outline" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary:
    "border border-transparent bg-[var(--brand-accent)] text-white hover:bg-[var(--brand-accent-hover)] focus-visible:ring-[var(--brand-accent)]",
  secondary:
    "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-strong)] hover:bg-[var(--bg-surface)] focus-visible:ring-[var(--text-muted)]",
  danger:
    "border border-transparent bg-[var(--status-danger-fg)] text-white hover:brightness-95 focus-visible:ring-[var(--status-danger-fg)]",
  outline:
    "border border-[var(--brand-accent)] bg-transparent text-[var(--brand-accent)] hover:bg-[var(--brand-accent-soft)] focus-visible:ring-[var(--brand-accent)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-strong)] focus-visible:ring-[var(--text-muted)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-55",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";
