"use client";

import { scaleSocial } from "@/lib/read-model";
import type { VerificationTier, VerifiedFilterLevel } from "@/lib/types";
import { formatCount } from "@/components/utils";

interface ReactionCountPillProps {
  up: number;
  down: number;
  /** Active Verified filter — thins social counts on cards (§4.3). */
  tierMin?: VerifiedFilterLevel;
  /** Viewer's reaction — highlights one segment when set. */
  selected?: "up" | "down" | null;
  /** When no selected side, fill both segments (share preview fallback). */
  highlightBoth?: boolean;
  /** Share preview — either segment toggles between my-reaction and both. */
  onToggleHighlight?: () => void;
  className?: string;
}

/**
 * Display-only agree/disagree tallies for read-only surfaces (share preview, future display
 * contexts). Interactive reactions use `ReactionButtons` until `[participation-pill-unify]`.
 * See `.agents/PARTICIPATION-PILL-PROMPTS.md`.
 */
export function ReactionCountPill({
  up,
  down,
  tierMin = 0,
  selected = null,
  highlightBoth = false,
  onToggleHighlight,
  className = "",
}: ReactionCountPillProps) {
  const shown = (n: number) => scaleSocial(n, tierMin);

  const segmentActive = (dir: "up" | "down") =>
    selected === dir || (highlightBoth && selected == null);

  const hasHighlight = selected != null || highlightBoth;

  const segment = (dir: "up" | "down", count: number) => {
    const active = segmentActive(dir);
    const upStyles = active
      ? "bg-verify-100 font-bold text-verify-700"
      : "text-ink-soft hover:bg-verify-100/60";
    const downStyles = active
      ? "bg-danger-200 font-bold text-danger-700"
      : "text-ink-soft hover:bg-danger-200/60";
    const tone = dir === "up" ? upStyles : downStyles;

    const glyph = (
      <>
        <span
          aria-hidden
          className={`text-xs leading-none ${active ? "font-bold" : ""}`}
        >
          {dir === "up" ? "✓" : "✗"}
        </span>
        {formatCount(shown(count))}
      </>
    );

    if (onToggleHighlight) {
      return (
        <button
          type="button"
          onClick={onToggleHighlight}
          aria-label="Toggle reaction preview emphasis"
          className={`inline-flex h-5 flex-1 items-center justify-center gap-0.5 px-2 text-xs transition-colors cursor-pointer ${tone}`}
        >
          {glyph}
        </button>
      );
    }

    return (
      <span className={`inline-flex items-center gap-0.5 px-2 ${tone}`}>
        {glyph}
      </span>
    );
  };

  const inner = (
    <>
      {segment("up", up)}
      <span className="w-px shrink-0 self-stretch bg-ink" aria-hidden />
      {segment("down", down)}
    </>
  );

  if (hasHighlight || onToggleHighlight) {
    return (
      <span
        role="group"
        aria-label="Reactions"
        className={`pill-chrome inline-flex rounded-full ${className}`}
      >
        <span className="inline-flex h-5 overflow-hidden rounded-full bg-surface text-xs">
          {inner}
        </span>
      </span>
    );
  }

  return (
    <span
      role="group"
      aria-label="Reactions"
      className={`pill-chrome inline-flex h-5 items-center overflow-hidden rounded-full bg-surface text-xs text-ink-soft ${className}`}
    >
      {inner}
    </span>
  );
}
