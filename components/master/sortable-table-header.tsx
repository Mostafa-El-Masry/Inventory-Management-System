"use client";

export type SortDirection = "asc" | "desc";

export function SortableTableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-left font-inherit text-inherit transition hover:text-[var(--text-strong)]"
    >
      <span>{label}</span>
      <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {active ? (direction === "asc" ? "A-Z" : "Z-A") : "A-Z"}
      </span>
    </button>
  );
}
