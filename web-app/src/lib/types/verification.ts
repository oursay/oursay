/**
 * Author verification tier.
 *
 * The wireframe uses a 0-3 numeric tier (`p.tier`) and the Verified filter
 * compares inclusively upward (`tier >= state.verified`). The canonical domain
 * model treats verification as set membership rather than a strict ladder (see
 * docs/entities/account/verification.md); the numeric tier here is a UI-facing
 * projection that preserves the wireframe's ordering for the filter ladder.
 *
 *   0 Any        - no verification constraint (public + all tiers)
 *   1 Identity   - identity-verified
 *   2 Residency  - residency-verified
 *   3 Official   - MLA / government
 */
export type VerificationTier = 0 | 1 | 2 | 3;

/**
 * Identity-pill display mode. `full` = tight rounded pill with icon + label;
 * `icon` = equal-sided circle with icon only (accessible aria-label).
 */
export type PillDisplayMode = "full" | "icon";

/** Wireframe-facing label per tier (KYC pills; filter ladder uses VERIFIED_LEVELS). */
export const TIER_LABEL: Record<VerificationTier, string> = {
  0: "None",
  1: "Identity",
  2: "Residency",
  3: "Official",
};

/** Verified Refine filter ladder (inclusive-upward on author tier). */
export const VERIFIED_LEVELS = ["Any", "Identity", "Residency", "Official"] as const;
export type VerifiedLevel = (typeof VERIFIED_LEVELS)[number];

/** Canonical KYC tier token used by the API (api/openapi.yaml `tier` enum). */
export type CanonicalTierToken =
  | "unverified"
  | "identity_verified"
  | "residency_verified"
  | "electoral_validated";

/** Numeric wireframe tier -> canonical API token. */
export const TIER_TO_TOKEN: Record<VerificationTier, CanonicalTierToken> = {
  0: "unverified",
  1: "identity_verified",
  2: "residency_verified",
  3: "electoral_validated",
};
