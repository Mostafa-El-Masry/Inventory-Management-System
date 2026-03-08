"use client";

import { Button } from "@/components/ui/button";

type MasterPageHeaderProps = {
  kicker: string;
  title: string;
  subtitle: string;
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
        <p className="ims-kicker">{kicker}</p>
        <h1 className="ims-title">{title}</h1>
        <p className="ims-subtitle">{subtitle}</p>
      </div>

      {showAction ? (
        <Button
          variant="secondary"
          className="ims-control-sm mt-1 w-9 rounded-full p-0 text-lg leading-none"
          aria-label={panelOpen ? closeLabel : openLabel}
          onClick={onTogglePanel}
        >
          {panelOpen ? "x" : "+"}
        </Button>
      ) : null}
    </header>
  );
}
