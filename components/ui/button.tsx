import { ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "danger" | "outline" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary:
    "border border-transparent bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)] focus-visible:ring-[var(--brand-primary)]",
  secondary:
    "border border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-strong)] hover:bg-[var(--surface)] focus-visible:ring-[var(--brand-primary)]",
  danger:
    "border border-transparent bg-[var(--status-danger-fg)] text-white hover:brightness-95 focus-visible:ring-[var(--status-danger-fg)]",
  outline:
    "border border-[var(--brand-primary)] bg-transparent text-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] focus-visible:ring-[var(--brand-primary)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)] focus-visible:ring-[var(--brand-primary)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-[var(--radius-lg)] px-[var(--space-4)] text-sm font-semibold transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-55",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";
