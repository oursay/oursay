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

  const compact = scale === "card";

  const half = (dir: "up" | "down", count: number) => {
    const active = selected === dir;
    const upStyles = active
      ? "bg-verify-100 font-bold text-verify-700"
      : "text-ink-soft hover:bg-verify-100/60";
    const downStyles = active
      ? "bg-danger-200 font-bold text-danger-700"
      : "text-ink-soft hover:bg-danger-200/60";
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReact?.(dir)}
        aria-pressed={active}
        aria-label={dir === "up" ? "Agree" : "Disagree"}
        className={`inline-flex flex-1 items-center justify-center gap-0.5 transition-colors ${
          compact ? "h-5 px-2 text-xs" : "min-h-9 px-3 text-sm"
        } ${dir === "up" ? upStyles : downStyles} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span
          aria-hidden
          className={`leading-none ${compact ? "text-xs" : "text-[15px]"} ${active ? "font-bold" : ""}`}
        >
          {dir === "up" ? "✓" : "✗"}
        </span>
        {formatCount(shown(count))}
      </button>
    );
  };

  return (
    <div className="pill-chrome inline-flex rounded-full">
      <div
        className={`inline-flex overflow-hidden rounded-full bg-surface ${
          compact ? "h-5" : ""
        }`}
      >
        {half("up", up)}
        <span className="w-px shrink-0 self-stretch bg-ink" aria-hidden />
        {half("down", down)}
      </div>
    </div>
  );
}
