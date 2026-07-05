"use client";

import type { ReactNode } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { jurisdictionPillIcon } from "@/lib/jurisdiction-icon";

interface AppHeaderProps {
  /** Jurisdiction scope pill (feed) or the view's own jurisdiction name. */
  jurisdictionLabel: string;
  /** Tap the icon + label -> go to the feed. */
  onJurisdictionLabelClick?: () => void;
  /** Tap the caret -> open the scope selector dropdown. */
  onJurisdictionCaretClick?: () => void;
  onFilterClick?: () => void;
  filterActive?: boolean;
  /** Avatar / login affordance rendered at the far right. */
  accountSlot?: ReactNode;
}

/** Fixed top chrome: filter (left), jurisdiction selector (centre), account (right). */
export function AppHeader({
  jurisdictionLabel,
  onJurisdictionLabelClick,
  onJurisdictionCaretClick,
  onFilterClick,
  filterActive = false,
  accountSlot,
}: AppHeaderProps) {
  const JurisdictionIcon = jurisdictionPillIcon(jurisdictionLabel);

  return (
    <header className="pointer-events-none grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 pb-3 pt-2">
      {onFilterClick ? (
        <button
          type="button"
          onClick={onFilterClick}
          aria-label="Filter"
          aria-pressed={filterActive}
          className={`pointer-events-auto inline-flex size-10 items-center justify-center rounded-full border border-border-strong bg-surface shadow-sm hover:bg-surface-muted ${filterActive ? "text-brand-600" : "text-ink"}`}
        >
          <Filter size={20} aria-hidden />
        </button>
      ) : (
        <div className="size-10" aria-hidden />
      )}

      <div className="pointer-events-auto mx-auto inline-flex min-h-9 max-w-full items-center rounded-full border border-border-strong bg-surface text-sm font-medium text-ink shadow-sm">
        <button
          type="button"
          onClick={onJurisdictionLabelClick}
          aria-label={`${jurisdictionLabel} — go to feed`}
          className="inline-flex min-w-0 items-center gap-1.5 self-stretch rounded-l-full py-1 pl-3 pr-1.5 hover:bg-surface-muted"
        >
          <JurisdictionIcon size={16} className="shrink-0 text-ink-soft" aria-hidden />
          <span className="truncate">{jurisdictionLabel}</span>
        </button>
        <button
          type="button"
          onClick={onJurisdictionCaretClick}
          aria-label="Change jurisdictions"
          aria-haspopup="menu"
          className="inline-flex items-center self-stretch rounded-r-full py-1 pl-1 pr-2.5 hover:bg-surface-muted"
        >
          <ChevronDown size={14} className="shrink-0 text-ink-soft" aria-hidden />
        </button>
      </div>

      <div className="pointer-events-auto flex items-center justify-end">{accountSlot}</div>
    </header>
  );
}
