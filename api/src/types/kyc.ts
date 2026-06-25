// Canonical KYC verification tiers (docs/01 §4; KycRepo VERIFIED_TIERS). Kept in a tiny,
// dependency-free module so the provider seam, the read/count service, and the HTTP routes share ONE
// definition without an import cycle (provider ↔ read-service). Enum-validated on the wire even though
// only the stub provider issues them — a freeform string invites drift.
//
// Matching is SET MEMBERSHIP, not an ordering: tiers are provider/purpose-specific (identity, residency,
// electoral, and future capabilities) and do NOT form a single strict ladder. Deliberately NO rank table
// here — a cumulative helper would invite accidental at-or-above logic.

export type KycTier = "unverified" | "identity_verified" | "residency_verified" | "electoral_validated";
export const KYC_TIERS: KycTier[] = ["unverified", "identity_verified", "residency_verified", "electoral_validated"];

/** Coerce a raw `kyc_attestations.tier` string (or null = no row) to a canonical tier; an unrecognized
 *  or absent value is `unverified` (the floor — also the bucket for an unlinkable participant). */
export function normalizeTier(raw: string | null | undefined): KycTier {
  return raw != null && (KYC_TIERS as string[]).includes(raw) ? (raw as KycTier) : "unverified";
}
