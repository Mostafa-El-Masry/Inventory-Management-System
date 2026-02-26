import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ims-page flex min-h-dvh items-center justify-center px-4 py-8 md:px-6">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[0_12px_34px_rgba(16,17,20,0.08)] md:p-7">
        {children}
      </div>
    </div>
  );
}
