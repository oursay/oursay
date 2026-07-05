import type { JurisdictionConfig } from "@oursay/public-record";
import { DEFAULT_CONTENT_LIMITS, DEFAULT_LABELS } from "@oursay/public-record";

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
    // ⊇-consistent with the official-count gates below (residency-based): identity_verified alone
    // does not unlock AB scalars (WEB-APP-GAPS Part 3 note).
    minTier: ["residency_verified"],
  },
  // Alberta product labels: a `post` is a "Statement", a `district` is a "riding"; the rest are the
  // platform defaults. Content caps match the documented launch defaults.
  labels: { ...DEFAULT_LABELS, post: "Statement", district: "riding" },
  contentLimits: DEFAULT_CONTENT_LIMITS,
  // Locked gate matrix (WEB-APP-GAPS C5/Part 3 + Part 6 corrections):
  //   - statements/petitions/polls/votes/signatures carry a PASSKEY sign floor; comments/reactions quick.
  //   - petition creation = residency-verified (Part 5 #2); poll/result creation = official ROLE only.
  //   - vote.act = jurisdiction residency; official-role holders are DENIED on vote (act-blocked) and
  //     petition_signature (count-excluded, reason `official_role`) — Part 6 #3.
  //   - petition_signature.act = anyone (sign-now-verify-later); its officialCount floor is residency.
  gates: {
    post: { act: "anyone", signMin: "passkey" },
    petition: { act: { tiers: ["residency_verified"] }, signMin: "passkey" },
    poll: { act: { role: "official" }, signMin: "passkey" },
    result: { act: { role: "official" }, signMin: "passkey" },
    comment: { act: "anyone", signMin: "quick" },
    reaction: { act: "anyone", signMin: "quick" },
    vote: { act: { residencyIn: "jurisdiction" }, signMin: "passkey", deny: [{ role: "official" }] },
    petition_signature: {
      act: "anyone",
      signMin: "passkey",
      officialCount: { residencyIn: "jurisdiction" },
      deny: [{ role: "official" }],
    },
  },
  // Graduation (Part 6 #9): moving %-of-verified threshold now; a fixed n (10% of the previous
  // provincial election's valid votes) replaces it later. AB officials may promote early.
  graduation: { threshold: { kind: "percentOfVerified", percent: 10, basis: "moving" }, officialEarlyPromotion: true },
  leader: { name: "Hon. A. Premier", handle: "premier" },
  rulesCopy: [
    "Ladder policy — levels graduate upward.",
    "Statements: open to any registered member (passkey-signed).",
    "Petitions: residency-verified authors only.",
    "Polls: officials only (or via petition→poll graduation).",
    "Verified actions are written on-ledger.",
    "Official counts: residency-verified electors only.",
  ],
};
