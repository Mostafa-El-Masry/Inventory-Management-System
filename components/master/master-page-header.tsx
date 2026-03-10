"use client";

import { Button } from "@/components/ui/button";

type MasterPageHeaderProps = {
  kicker?: string;
  title: string;
  subtitle?: string;
  showAction?: boolean;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
  openLabel?: string;
  closeLabel?: string;
};

export function MasterPageHeader({
  kicker,
  title,
  subtitle,
  showAction = false,
  panelOpen = false,
  onTogglePanel,
  openLabel = "Open master actions",
  closeLabel = "Close master actions",
}: MasterPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        {kicker ? <p className="ims-kicker">{kicker}</p> : null}
        <h1 className="ims-title">{title}</h1>
        {subtitle ? <p className="ims-subtitle">{subtitle}</p> : null}
      </div>

      {showAction ? (
        <Button
          variant="ghost"
          className="mt-1 h-[4.5rem] w-[4.5rem] rounded-full border-0 bg-transparent p-0 text-[2.25rem] leading-none text-[var(--text-strong)] shadow-none hover:bg-transparent"
          aria-label={panelOpen ? closeLabel : openLabel}
          onClick={onTogglePanel}
        >
          {panelOpen ? "x" : "+"}
        </Button>
      ) : null}
    </header>
  );
}
