"use client";

export type SortDirection = "asc" | "desc";

function SortDirectionIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  const showUpArrow = active && direction === "desc";
  const iconClass = active ? "text-[var(--brand-primary)]" : "text-[var(--text-muted)]";

  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path
        d={showUpArrow ? "M6 9.5v-7M6 2.5 3.8 4.7M6 2.5 8.2 4.7" : "M6 2.5v7M6 9.5 3.8 7.3M6 9.5 8.2 7.3"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClass}
      />
    </svg>
  );
}

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
      className={[
        "inline-flex items-center gap-1.5 text-left font-inherit transition hover:text-[var(--text-strong)]",
        active ? "text-[var(--text-strong)]" : "text-inherit",
      ].join(" ")}
    >
      <span>{label}</span>
      <SortDirectionIcon active={active} direction={direction} />
    </button>
  );
}
