/**
 * Author KYC verification tier (0–2 only). Official is a separate role flag
 * on author DTOs (`official`), not a KYC rung.
 *
 * The Verified Refine filter still has an Official step — that uses
 * {@link VerifiedFilterLevel}, not this type.
 *
 *   0 unverified
 *   1 identity-verified
 *   2 residency-verified
 */
export type VerificationTier = 0 | 1 | 2;

/**
 * Verified Refine filter ladder (inclusive-upward for KYC steps; Official is
 * a role check). Level 3 means “official role”, not a KYC tier.
 *
 *   0 Any
 *   1 Identity
 *   2 Residency
 *   3 Official (role)
 */
export type VerifiedFilterLevel = 0 | 1 | 2 | 3;

/**
 * Identity-pill display mode. `full` = tight rounded pill with icon + label;
 * `icon` = equal-sided circle with icon only (accessible aria-label).
 */
export type PillDisplayMode = "full" | "icon";

/**
 * A Residency (tier 2) author's spatial relation to the viewer + open context —
 * the ONLY residence signal the server ever returns. Raw author districts stay
 * server-side (a member's district is never shared with other members); DTOs
 * carry this narrowest-relation projection instead:
 *
 *   home > affected > jurisdiction > none
 *
 * - "home"         co-resides with the viewer in a district of the post's
 *                  jurisdiction (needs a residency-verified viewer; never on
 *                  district-less jurisdictions like Global)
 * - "affected"     resident of the open post's affected area
 * - "jurisdiction" in the post's jurisdiction but outside its affected area
 * - "none"         no contextual relation (or below Residency — the tiers
 *                  themselves travel as `tier`)
 *
 * Officials (`official: true`) are treated as residents of the
 * district/jurisdiction they represent for filtering, and show the Official
 * mark (not a geo glyph). See read-model authorGeoRelation().
 */
export type AuthorGeoRelation = "none" | "home" | "affected" | "jurisdiction";

/** Wireframe-facing label per KYC tier. */
export const TIER_LABEL: Record<VerificationTier, string> = {
  0: "None",
  1: "Identity",
  2: "Residency",
};

/** Verified Refine filter ladder labels (aligned with {@link VerifiedFilterLevel}). */
export const VERIFIED_LEVELS = ["Any", "Identity", "Residency", "Official"] as const;
export type VerifiedLevel = (typeof VERIFIED_LEVELS)[number];

/** Canonical KYC tier token used by the API (api/openapi.yaml `tier` enum). */
export type CanonicalTierToken =
  | "unverified"
  | "identity_verified"
  | "residency_verified"
  | "electoral_validated";

/** Numeric KYC tier -> canonical API token. */
export const TIER_TO_TOKEN: Record<VerificationTier, CanonicalTierToken> = {
  0: "unverified",
  1: "identity_verified",
  2: "residency_verified",
};

/** Author fields the Verified Refine ladder reads. */
export type VerifiedAuthor = {
  tier: VerificationTier;
  /** Official role flag (not a KYC tier). */
  official?: boolean;
};

/**
 * Verified Refine match: level 3 = official role; levels 1–2 are KYC floors
 * (officials also pass, preserving the old grafted tier-3 inclusive behavior).
 */
export function passesVerifiedFilter(
  author: VerifiedAuthor,
  tierMin: VerifiedFilterLevel,
): boolean {
  if (tierMin === 0) return true;
  if (tierMin === 3) return Boolean(author.official);
  return author.tier >= tierMin || Boolean(author.official);
}
