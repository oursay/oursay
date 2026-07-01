import type { VerificationTier } from "@/lib/types";

/**
 * Count scaling (wireframe SOCIAL_SCALE / CIVIC_UNVERIFIED_EXTRA).
 *
 * Social counts (comments + agree/disagree reactions) are thinned as the Verified
 * filter rises — fewer qualifying voices are shown. Civic counts (petition
 * signatures + poll votes) are NEVER thinned: the bar/number is always the
 * official residency-verified total. Instead, lowering Verified below Residency
 * reveals an ADDITIVE "+N unverified" note surfacing participants who took part
 * but aren't in the official count.
 */

/** Social-count multiplier, indexed by tier (None · ID · Residency · Official). */
export const SOCIAL_SCALE = [1, 0.62, 0.34, 0.08] as const;

/** Additive unverified-civic fraction, indexed by tier. */
export const CIVIC_UNVERIFIED_EXTRA = [0.35, 0.12, 0, 0] as const;

/** Thin a social count for the active Verified tier. */
export function scaleSocial(n: number, tierMin: VerificationTier): number {
  return Math.max(0, Math.round(n * SOCIAL_SCALE[tierMin]));
}

/** The additive "+N unverified" civic count for the active Verified tier. */
export function civicExtra(n: number, tierMin: VerificationTier): number {
  return Math.round(n * CIVIC_UNVERIFIED_EXTRA[tierMin]);
}
