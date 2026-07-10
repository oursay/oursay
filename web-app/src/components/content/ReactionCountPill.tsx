import { scaleSocial } from "@/lib/read-model";
import type { VerificationTier } from "@/lib/types";
import { formatCount } from "@/components/utils";

interface ReactionCountPillProps {
  up: number;
  down: number;
  /** Active Verified filter — thins social counts on cards (§4.3). */
  tierMin?: VerificationTier;
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
  className = "",
}: ReactionCountPillProps) {
  const shown = (n: number) => scaleSocial(n, tierMin);

  return (
    <span
      role="group"
      aria-label="Reactions"
      className={`pill-chrome inline-flex h-5 items-center overflow-hidden rounded-full bg-surface text-xs text-ink-soft ${className}`}
    >
      <span className="inline-flex items-center gap-0.5 px-2">
        <span aria-hidden className="text-xs leading-none">
          ✓
        </span>
        {formatCount(shown(up))}
      </span>
      <span className="w-px shrink-0 self-stretch bg-ink" aria-hidden />
      <span className="inline-flex items-center gap-0.5 px-2">
        <span aria-hidden className="text-xs leading-none">
          ✗
        </span>
        {formatCount(shown(down))}
      </span>
    </span>
  );
}
