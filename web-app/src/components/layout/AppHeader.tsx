"use client";

import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

interface AppHeaderProps {
  title: string;
  /** Jurisdiction scope pill (feed) or the view's own jurisdiction name. */
  jurisdictionLabel?: string;
  onJurisdictionClick?: () => void;
  onFilterClick?: () => void;
  filterActive?: boolean;
  /** Avatar / login affordance rendered at the far right. */
  avatarSlot?: ReactNode;
}

/** Sticky top chrome: title, jurisdiction pill, filter affordance, avatar slot. */
export function AppHeader({
  title,
  jurisdictionLabel,
  onJurisdictionClick,
  onFilterClick,
  filterActive = false,
  avatarSlot,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <h1 className="text-base font-bold text-ink">{title}</h1>
        {jurisdictionLabel ? (
          <button
            type="button"
            onClick={onJurisdictionClick}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border-strong bg-surface px-3 text-xs font-medium text-ink-soft hover:bg-surface-muted"
          >
            {jurisdictionLabel}
            <ChevronDown size={13} aria-hidden />
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {onFilterClick ? (
            <button
              type="button"
              onClick={onFilterClick}
              aria-label="Filter"
              aria-pressed={filterActive}
              className={`inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-muted ${filterActive ? "text-brand-600" : "text-ink-soft"}`}
            >
              <SlidersHorizontal size={18} aria-hidden />
            </button>
          ) : null}
          {avatarSlot}
        </div>
      </div>
    </header>
  );
}
