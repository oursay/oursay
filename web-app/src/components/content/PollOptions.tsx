"use client";

import { Check } from "lucide-react";
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
    <div className="space-y-2">
      {options.map((o) => {
        const mine = selectedVote === o.label;
        const pct = Math.round((o.v / total) * 100);
        const extra = civicExtra(o.v, tierMin);
        return (
          <div key={o.label}>
            <button
              type="button"
              disabled={locked || !onVote}
              onClick={() => onVote?.(o.label)}
              className={`relative block w-full overflow-hidden rounded-lg border text-left ${mine ? "border-brand-400" : "border-border"} ${locked || !onVote ? "cursor-default" : "hover:border-brand-300"}`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${mine ? "bg-brand-200" : "bg-surface-muted"}`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex min-h-9 items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span
                  className={`flex items-center gap-1 ${mine ? "font-semibold text-ink" : "text-ink-soft"}`}
                >
                  {mine ? <Check size={14} aria-hidden /> : null}
                  {o.label}
                </span>
                <span className="text-ink-soft">{formatCount(o.v)}</span>
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
