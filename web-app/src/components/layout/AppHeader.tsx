"use client";

import type { ReactNode } from "react";
import { ChevronDown, Filter, Globe } from "lucide-react";

interface AppHeaderProps {
  /** Jurisdiction scope pill (feed) or the view's own jurisdiction name. */
  jurisdictionLabel: string;
  onJurisdictionClick?: () => void;
  onFilterClick?: () => void;
  filterActive?: boolean;
  /** Avatar / login affordance rendered at the far right. */
  accountSlot?: ReactNode;
}

/** Fixed top chrome: filter (left), jurisdiction selector (centre), account (right). */
export function AppHeader({
  jurisdictionLabel,
  onJurisdictionClick,
  onFilterClick,
  filterActive = false,
  accountSlot,
}: AppHeaderProps) {
  return (
    <header className="z-30 shrink-0 border-b border-border bg-surface">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2">
        {onFilterClick ? (
          <button
            type="button"
            onClick={onFilterClick}
            aria-label="Filter"
            aria-pressed={filterActive}
            className={`inline-flex size-10 items-center justify-center rounded-full border border-border-strong bg-surface hover:bg-surface-muted ${filterActive ? "text-brand-600" : "text-ink"}`}
          >
            <Filter size={20} aria-hidden />
          </button>
        ) : (
          <div className="size-10" aria-hidden />
        )}

        <button
          type="button"
          onClick={onJurisdictionClick}
          className="mx-auto inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          <Globe size={16} className="shrink-0 text-ink-soft" aria-hidden />
          <span className="truncate">{jurisdictionLabel}</span>
          <ChevronDown size={14} className="shrink-0 text-ink-soft" aria-hidden />
        </button>

        <div className="flex items-center justify-end">{accountSlot}</div>
      </div>
    </header>
  );
}
