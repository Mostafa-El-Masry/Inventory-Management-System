import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ims-page flex min-h-dvh items-center justify-center px-[var(--space-4)] py-[var(--space-7)] md:px-[var(--space-6)]">
      <div className="w-full max-w-[32rem] rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface)] p-[var(--space-6)] shadow-[var(--shadow-lg)] md:p-[var(--space-7)]">
        {children}
      </div>
    </div>
  );
}
