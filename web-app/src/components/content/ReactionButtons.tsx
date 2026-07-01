"use client";

import { scaleSocial } from "@/lib/read-model";
import type { VerificationTier } from "@/lib/types";
import { formatCount } from "@/components/utils";

interface ReactionButtonsProps {
  up: number;
  down: number;
  /** The viewer's own exclusive reaction. */
  selected?: "up" | "down" | null;
  /** card = feed footer (thinned by tierMin); detail = post page (raw). */
  scale?: "card" | "detail";
  /** Active Verified filter — thins social counts on cards (§4.3). */
  tierMin?: VerificationTier;
  onReact?: (dir: "up" | "down") => void;
  disabled?: boolean;
}

/** Split ✓ agree | ✗ disagree capsule; exclusive selection, selected half filled. */
export function ReactionButtons({
  up,
  down,
  selected = null,
  scale = "card",
  tierMin = 0,
  onReact,
  disabled = false,
}: ReactionButtonsProps) {
  const shown = (n: number) =>
    scale === "card" ? scaleSocial(n, tierMin) : n;

  const half = (dir: "up" | "down", count: number) => {
    const active = selected === dir;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReact?.(dir)}
        aria-pressed={active}
        aria-label={dir === "up" ? "Agree" : "Disagree"}
        className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1 px-3 text-sm ${active ? "bg-surface-muted font-semibold text-ink" : "text-ink-soft"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:bg-surface-muted"}`}
      >
        <span aria-hidden className="text-[15px] leading-none">
          {dir === "up" ? "✓" : "✗"}
        </span>
        {formatCount(shown(count))}
      </button>
    );
  };

  return (
    <div className="inline-flex overflow-hidden rounded-full border border-border-strong bg-surface shadow-sm">
      {half("up", up)}
      <span className="w-px self-stretch bg-border" aria-hidden />
      {half("down", down)}
    </div>
  );
}
