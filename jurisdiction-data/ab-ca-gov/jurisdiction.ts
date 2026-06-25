import type { JurisdictionConfig } from "@oursay/public-record";

// ab-ca-gov — the Alberta provincial LAUNCH jurisdiction. Production-like gating: FINAL-action
// semantics (no change/revoke), and vote/signature scalars are TIER-GATED — a public count is disclosed
// only when the request restricts to genuinely-verified participants (a tier set ⊆ `minTier`); an
// unfiltered or unverified-including request is withheld. This keeps raw, all-comers totals off the
// public surface while still letting clients see verified-participant counts via `?tier=`.
//
// `minTier` intentionally OMITS `electoral_validated`: that tier is not attainable until Elections
// Alberta stands up a KYC service we can integrate with, so gating on it would withhold counts that can
// never be unlocked. Add it here once that integration exists.
//
// District boundary data for this jurisdiction lives in ./districts/ (ingested by @oursay/geo, not
// imported here).
export const abCaGov: JurisdictionConfig = {
  id: "ab-ca-gov",
  level: "provincial",
  label: "Alberta",
  rules: {
    allowChange: false,
    allowRevoke: false,
  },
  counts: {
    votes: true,
    signatures: true,
    minTier: ["identity_verified", "residency_verified"],
  },
};
