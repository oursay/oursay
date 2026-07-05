"use client";

import { Forward } from "lucide-react";
import { formatCount } from "@/components/utils";

interface SharePillProps {
  count: number;
  /** Viewer has shared this record/comment — purple accent like civic pills. */
  shared?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Compact share count capsule (forward glyph) — matches CommentPill chrome. */
export function SharePill({
  count,
  shared = false,
  onClick,
  className = "",
}: SharePillProps) {
  const tone = shared
    ? "bg-brand-100 font-bold text-brand-700"
    : "bg-surface text-ink-soft hover:bg-surface-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={shared}
      aria-label="Share"
      className={`pill-chrome inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs disabled:cursor-default ${tone} ${className}`}
    >
      <Forward size={11} aria-hidden />
      {formatCount(count)}
    </button>
  );
}
