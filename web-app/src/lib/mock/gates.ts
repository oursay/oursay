import {
  ALBERTA_ID,
  GLOBAL_ID,
  type ActionGate,
  type GatedAction,
  type JurisdictionGates,
  type JurisdictionId,
  type RecordKind,
  type SignAction,
  type SignFloor,
  type SignMethod,
  type SignTier,
  type VerificationTier,
} from "@/lib/types";
import { toCanonical } from "@/lib/types";

/**
 * Per-jurisdiction gate tables — the web-app mirror of the backend
 * `JurisdictionGates` (`jurisdiction-data/<id>/jurisdiction.ts`), the single
 * source compose eligibility and sign floors derive from (M2/M3). Tier sets use
 * numeric {@link VerificationTier}s: identity_verified ⇒ 1, residency_verified ⇒
 * 2 (the backend's KycTier strings; the W5 served config maps back).
 *
 * Locked values (WEB-APP-GAPS Part 3 / C5):
 * - `oursay-global`: everything anyone·quick; vote/petition_signature enter the
 *   platform count at ID-verified-or-better.
 * - `ab-ca-gov`: statements quick floor (passkey optional / ask default);
 *   votes/signatures/petitions/polls passkey-signed; petitions residency-verified
 *   authors; polls Official OR media-accredited OR platform admin; result
 *   official-only (interim); votes need jurisdiction residency; signatures are
 *   sign-now-verify-later (platform count at residency); official-role holders
 *   are DENIED on vote and petition_signature (Part 6 #3).
 */
export const JURISDICTION_GATES: Record<JurisdictionId, JurisdictionGates> = {
  [GLOBAL_ID]: {
    post: { act: "anyone", signMin: "quick" },
    petition: { act: "anyone", signMin: "quick" },
    poll: { act: "anyone", signMin: "quick" },
    result: { act: "anyone", signMin: "quick" },
    comment: { act: "anyone", signMin: "quick" },
    reaction: { act: "anyone", signMin: "quick" },
    vote: { act: "anyone", signMin: "quick", officialCount: { tiers: [1, 2] } },
    petition_signature: {
      act: "anyone",
      signMin: "quick",
      officialCount: { tiers: [1, 2] },
    },
  },
  [ALBERTA_ID]: {
    post: { act: "anyone", signMin: "quick" },
    petition: { act: { tiers: [2] }, signMin: "passkey" },
    poll: {
      act: [{ role: "official" }, { mediaAccredited: true }, { platformRole: "admin" }],
      signMin: "passkey",
    },
    result: { act: { role: "official" }, signMin: "passkey" },
    comment: { act: "anyone", signMin: "quick" },
    reaction: { act: "anyone", signMin: "quick" },
    vote: {
      act: { residencyIn: "jurisdiction" },
      signMin: "passkey",
      deny: [{ role: "official" }],
    },
    petition_signature: {
      act: "anyone",
      signMin: "passkey",
      officialCount: { residencyIn: "jurisdiction" },
      deny: [{ role: "official" }],
    },
  },
};

/** Platform-catalog body ids OurSay recognizes for Media-gated acts (mirrors jurisdiction-data). */
export const RECOGNIZED_ACCREDITATION_BODY_IDS: Record<JurisdictionId, string[]> = {
  [GLOBAL_ID]: [],
  [ALBERTA_ID]: ["ab-leg-gallery"],
};

/** Anyone·quick fallback for an unmodelled jurisdiction (mirrors DEFAULT_GATES). */
const DEFAULT_GATES: JurisdictionGates = {
  post: { act: "anyone", signMin: "quick" },
  petition: { act: "anyone", signMin: "quick" },
  poll: { act: "anyone", signMin: "quick" },
  result: { act: "anyone", signMin: "quick" },
  comment: { act: "anyone", signMin: "quick" },
  reaction: { act: "anyone", signMin: "quick" },
  vote: { act: "anyone", signMin: "quick" },
  petition_signature: { act: "anyone", signMin: "quick" },
};

/** The gate table for a jurisdiction (DEFAULT_GATES when unmodelled). */
export function gatesFor(jurisdictionId: JurisdictionId): JurisdictionGates {
  return JURISDICTION_GATES[jurisdictionId] ?? DEFAULT_GATES;
}

/** One action's gate in a jurisdiction. */
export function gateFor(
  jurisdictionId: JurisdictionId,
  action: GatedAction,
): ActionGate {
  return gatesFor(jurisdictionId)[action];
}

/** Canonical gated action for a composed record kind (statement ⇒ post). */
export function gatedActionForKind(kind: RecordKind): GatedAction {
  return toCanonical(kind);
}

/** A signing-pref action mapped to its canonical gated action. */
const SIGN_ACTION_TO_GATED: Record<SignAction, GatedAction> = {
  "post.statement": "post",
  "post.petition": "petition",
  "post.poll": "poll",
  signature: "petition_signature",
  vote: "vote",
  comment: "comment",
  reaction: "reaction",
};

/**
 * The signing method a jurisdiction mandates AT MINIMUM for an action, in the
 * account-preference scale (`quick | passkey`) — derived from the gate config's
 * `signMin` floor (replaces the old Alberta name-switch). A user preference may
 * exceed it (strongest wins; see {@link effectiveSignMethod}).
 */
export function jurisdictionSignRequirement(
  jurisdictionId: JurisdictionId,
  action: SignAction,
): SignMethod {
  return gateFor(jurisdictionId, SIGN_ACTION_TO_GATED[action]).signMin;
}

/** signTier the floor implies: passkey ⇒ 1 (Signed pill), quick ⇒ 0. */
export function signTierForFloor(floor: SignFloor): SignTier {
  return floor === "passkey" ? 1 : 0;
}

/**
 * The minimum signTier a jurisdiction's floor mandates for an action — the M8
 * anchor: a corpus row's signTier can never sit BELOW its jurisdiction's floor
 * (a hand-set opt-up above the floor is fine).
 */
export function minSignTier(
  jurisdictionId: JurisdictionId,
  action: GatedAction,
): SignTier {
  return signTierForFloor(gateFor(jurisdictionId, action).signMin);
}

/**
 * A corpus row's signTier reconciled with its jurisdiction floor: the stronger
 * of any hand-set hint and the floor (M8). Roots pass their canonical action.
 */
export function deriveSignTier(
  jurisdictionId: JurisdictionId,
  action: GatedAction,
  hinted?: SignTier,
): SignTier {
  const floor = minSignTier(jurisdictionId, action);
  return Math.max(hinted ?? 0, floor) as SignTier;
}
