"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CollapsibleSectionProps {
  icon?: LucideIcon;
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Optional count/caption shown before the chevron. */
  count?: string;
  children?: ReactNode;
  /** Optional override for the expanded content wrapper. */
  contentClassName?: string;
}

/** Collapsible interlink/section header — wireframe collHeader (chevron on the right). */
export function CollapsibleSection({
  icon: Icon,
  label,
  open,
  onToggle,
  count,
  children,
  contentClassName = "px-1 pt-3",
}: CollapsibleSectionProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 text-left"
      >
        {Icon ? <Icon size={16} className="shrink-0 text-ink" aria-hidden /> : null}
        <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
        {count ? <span className="text-xs text-muted">{count}</span> : null}
        {open ? (
          <ChevronDown size={16} className="text-ink-soft" aria-hidden />
        ) : (
          <ChevronRight size={16} className="text-ink-soft" aria-hidden />
        )}
      </button>
      {open && children ? <div className={contentClassName}>{children}</div> : null}
    </div>
  );
}
