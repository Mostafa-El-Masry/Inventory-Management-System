"use client";

import { useState } from "react";

import { cn } from "@/lib/utils/cn";
import { Input, InputProps } from "@/components/ui/input";

interface PasswordInputProps extends Omit<InputProps, "type"> {
  wrapperClassName?: string;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A11.6 11.6 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3 3.6" />
      <path d="M6.6 6.7C3.9 8.5 2 12 2 12a15.4 15.4 0 0 0 10 7 11.9 11.9 0 0 0 5.3-1.2" />
    </svg>
  );
}

export function PasswordInput({
  className,
  wrapperClassName,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pe-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 end-0 inline-flex w-11 items-center justify-center rounded-e-[var(--radius-md)] text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        <span className="h-4.5 w-4.5">{visible ? <EyeOffIcon /> : <EyeIcon />}</span>
      </button>
    </div>
  );
}
