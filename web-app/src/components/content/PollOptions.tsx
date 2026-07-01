"use client";

import { civicExtra } from "@/lib/read-model";
import type { RecordOption, VerificationTier } from "@/lib/types";
import { formatCount } from "@/components/utils";

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
              className={`relative block h-5 w-full overflow-hidden rounded border bg-surface-muted text-left ${
                mine ? "border-ink/40" : "border-border-strong"
              } ${locked || !onVote ? "cursor-default" : "hover:border-ink/30"}`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${mine ? "bg-neutral-500" : "bg-neutral-300"}`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex h-5 items-center justify-between gap-2 px-2 text-xs leading-none">
                <span
                  className={`truncate ${mine ? "font-semibold text-ink" : "text-ink-soft"}`}
                >
                  {mine ? (
                    <>
                      <span aria-hidden>✓ </span>
                      {o.label}
                    </>
                  ) : (
                    o.label
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {formatCount(o.v)}
                </span>
              </span>
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
