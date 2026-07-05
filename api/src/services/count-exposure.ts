// Per-jurisdiction PUBLIC COUNT EXPOSURE resolution (JurisdictionConfig.counts) — extracted from
// PublicRecordReadService so the unified feed ([align-w4-api-surface] P1) applies the SAME policy
// to its per-kind scalars: `none` exposed, `withheld` never public, `tier-gated` exposed only when
// the request restricts to a tier set ⊆ the jurisdiction's minTier (lists/detail/feed never filter
// by tier, so a gated scalar is always withheld there — call /counts?tier=… to view it).

import { getJurisdiction } from "@oursay/public-record";
import type { KycTier } from "../types/kyc.js";

/** Why a vote/signature scalar is (or isn't) on a public surface. */
export type CountGating = "none" | "withheld" | "tier-gated";

export const COUNT_GATING_NOTE =
  "vote/signature counts are publicly exposed for this jurisdiction (subject to the k-anonymity floor)";
export const WITHHELD_NOTE =
  "vote/signature counts are not publicly exposed for this jurisdiction";
export function tierGatedNote(minTier: readonly string[]): string {
  return (
    `vote/signature counts are tier-gated for this jurisdiction; restrict the request to verified ` +
    `tier(s) in {${minTier.join(", ")}} (e.g. ?tier=${minTier[0]}) to view them`
  );
}

/** Resolve the jurisdiction's exposure policy for one scalar. `requestedTiers` is the request's raw
 *  tier set (null on surfaces that never filter by tier); a tier-gated scalar is exposed only when
 *  that set is non-empty and ⊆ the jurisdiction's minTier. `gating` reports the POLICY state; the
 *  caller signals non-exposure by nulling the scalar (k-anon `suppressed` stays orthogonal). */
export function countExposure(
  jurisdictionId: string,
  scalar: "votes" | "signatures",
  requestedTiers: KycTier[] | null,
): { gating: CountGating; exposed: boolean; note: string } {
  const policy = getJurisdiction(jurisdictionId).counts;
  if (!policy) return { gating: "none", exposed: true, note: COUNT_GATING_NOTE };
  if (!policy[scalar]) return { gating: "withheld", exposed: false, note: WITHHELD_NOTE };
  const minTier = policy.minTier;
  if (!minTier || minTier.length === 0) return { gating: "none", exposed: true, note: COUNT_GATING_NOTE };
  const exposed = !!requestedTiers && requestedTiers.length > 0 && requestedTiers.every((t) => minTier.includes(t));
  return { gating: "tier-gated", exposed, note: tierGatedNote(minTier) };
}
