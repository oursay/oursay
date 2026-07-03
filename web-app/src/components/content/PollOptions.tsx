"use client";

import { civicExtra } from "@/lib/read-model";
import type { RecordOption, VerificationTier } from "@/lib/types";
import { formatCount } from "@/components/utils";

/** White/dark text split at the fill boundary — overlay clipped to the bar fill width. */
function PollBarText({
  label,
  count,
  pct,
  voted,
}: {
  label: string;
  count: string;
  pct: number;
  voted: boolean;
}) {
  const display = voted ? `✓ ${label}` : label;
  const innerWidth = `${10000 / pct}%`;

  // The track is light violet in both themes, so the base label layer is always
  // dark (ink flips to near-white in dark mode). The clipped overlay switches to
  // white only over a selected bar's dark brand-700 fill — the "split" text.
  return (
    <div className="relative h-5 w-full">
      <div className="flex h-5 w-full items-center justify-between gap-2 px-2 text-xs leading-none text-brand-900">
        <span className="truncate">{display}</span>
        <span className="shrink-0 tabular-nums">{count}</span>
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
        aria-hidden
        style={{ width: `${pct}%` }}
      >
        <div
          className={`flex h-5 items-center justify-between gap-2 px-2 text-xs leading-none ${
            voted ? "font-semibold text-white" : "text-brand-900"
          }`}
          style={{ width: innerWidth }}
        >
          <span className="truncate">{display}</span>
          <span className="shrink-0 tabular-nums">{count}</span>
        </div>
      </div>
    </div>
  );
}

interface PollOptionsProps {
  options: RecordOption[];
  /** The viewer's own ballot (option label). */
  selectedVote?: string | null;
  /** Result mode: immutable final tallies, no vote wiring. */
  frozen?: boolean;
  /** Alberta votes are final once cast — locks the control and shows a notice. */
  isFinalJurisdiction?: boolean;
  /** Active Verified filter — drives the additive "+N unverified votes" note. */
  tierMin?: VerificationTier;
  onVote?: (label: string) => void;
}

/**
 * Poll option bars. Live (poll) vs frozen (result) modes. The bar/number is
 * always the official residency-verified count — never thinned; lowering Verified
 * below Residency instead reveals an additive "+N unverified votes" note (§4.3).
 */
export function PollOptions({
  options,
  selectedVote = null,
  frozen = false,
  isFinalJurisdiction = false,
  tierMin = 0,
  onVote,
}: PollOptionsProps) {
  const total = options.reduce((a, o) => a + o.v, 0) || 1;
  const locked = frozen || (isFinalJurisdiction && !!selectedVote);

  return (
    <div className="space-y-1.5">
      {options.map((o) => {
        const mine = selectedVote === o.label;
        const pct = Math.max(4, Math.round((o.v / total) * 100));
        const extra = civicExtra(o.v, tierMin);
        return (
          <div key={o.label}>
            <button
              type="button"
              disabled={locked || !onVote}
              onClick={() => onVote?.(o.label)}
              className={`relative block h-5 w-full overflow-hidden rounded border text-left ${
                mine
                  ? "border-brand-600 bg-brand-100"
                  : "border-brand-200 bg-brand-100"
              } ${locked || !onVote ? "cursor-default" : "cursor-pointer hover:border-brand-400"}`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${mine ? "bg-brand-700" : "bg-brand-300"}`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <PollBarText
                label={o.label}
                count={formatCount(o.v)}
                pct={pct}
                voted={mine}
              />
            </button>
            {extra > 0 ? (
              <p className="mt-0.5 text-right text-[11px] text-muted">
                +{formatCount(extra)} unverified votes
              </p>
            ) : null}
          </div>
        );
      })}
      {selectedVote && isFinalJurisdiction ? (
        <p className="text-xs text-muted">
          Your vote is final — it cannot be changed.
        </p>
      ) : null}
    </div>
  );
}
