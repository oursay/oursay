"use client";

import type { ReactNode } from "react";
import { CircleCheckBig } from "lucide-react";
import { civicExtra } from "@/lib/read-model";
import type { AttachedPoll, VerificationTier } from "@/lib/types";
import { formatCount } from "@/components/utils";

interface PetitionProgressProps {
  sig: number;
  goal: number;
  /** A pre-attached poll flips the caption to a graduation tag. */
  attachedPoll?: AttachedPoll;
  /** Active Verified filter — drives the additive "+N unverified signatures" note. */
  tierMin?: VerificationTier;
  /** Sign CTA slot (parent supplies the button so the modal flow stays external). */
  children?: ReactNode;
}

/**
 * Petition signature progress bar. The bar/count is always the official
 * residency-verified total (never thinned); lowering Verified reveals an additive
 * unverified-signers note. A petition with an attachedPoll shows a compact
 * "Poll @ N" / "Poll Open" graduation tag once sig >= goal (§8.6).
 */
export function PetitionProgress({
  sig,
  goal,
  attachedPoll,
  tierMin = 0,
  children,
}: PetitionProgressProps) {
  const frac = Math.max(0, Math.min(1, sig / goal));
  const extra = civicExtra(sig, tierMin);
  const graduated = !!attachedPoll && sig >= goal;

  return (
    <div className="space-y-2">
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${frac * 100}%` }}
          aria-hidden
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {attachedPoll ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
            <CircleCheckBig size={13} aria-hidden />
            {graduated ? "Poll Open" : `Poll @ ${formatCount(goal)}`}
          </span>
        ) : (
          <span className="text-sm text-ink-soft">
            {formatCount(sig)} / {formatCount(goal)} signatures
          </span>
        )}
        {extra > 0 ? (
          <span className="text-[11px] text-muted">
            +{formatCount(extra)} unverified signatures
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
