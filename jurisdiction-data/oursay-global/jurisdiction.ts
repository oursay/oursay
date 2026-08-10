import { DEFAULT_CONTENT_LIMITS } from "@oursay/content-limits";
import type { JurisdictionConfig } from "@oursay/public-record";
import { DEFAULT_LABELS } from "@oursay/public-record";
import { oursayGlobalPlatformSeat } from "./steward-seat.js";

// oursay-global — the universal OurSay record and OPEN SANDBOX jurisdiction. Permissive by design:
// votes and signatures are publicly exposable with no tier gate, and change/revoke are allowed so
// dev/CI can iterate freely. The k-anonymity floor is left unset (uses the platform default); dev/CI
// relaxation is done through the platform-min env (PUBLIC_COUNTS_K_ANONYMITY_MIN), never by lowering a
// jurisdiction floor (a jurisdiction may only RAISE it). Display labels and content caps are the
// platform defaults verbatim (Statement/Petition/Poll/Result/District; the documented launch caps).
export const oursayGlobal: JurisdictionConfig = {
  id: "oursay-global",
  level: "federal",
  label: "OurSay Global",
  rules: {
    allowChange: true,
    allowRevoke: true,
  },
  counts: {
    votes: true,
    signatures: true,
  },
  labels: { ...DEFAULT_LABELS },
  contentLimits: DEFAULT_CONTENT_LIMITS,
  // No Media recognition list — open sandbox does not grant media-accredited powers via body ids.
  recognizedAccreditationBodyIds: [],
  // Locked gate matrix (WEB-APP-GAPS C5/Part 3): everything open at the quick floor; official
  // counts on the singletons use the "ID-or-better" tier set (Part 5 #8). officialCount is a
  // COUNTING floor, never a participation barrier (Part 6 #2).
  gates: {
    post: { act: "anyone", signMin: "quick" },
    petition: { act: "anyone", signMin: "quick" },
    poll: { act: "anyone", signMin: "quick" },
    result: { act: "anyone", signMin: "quick" },
    comment: { act: "anyone", signMin: "quick" },
    reaction: { act: "anyone", signMin: "quick" },
    vote: { act: "anyone", signMin: "quick", officialCount: { tiers: ["identity_verified", "residency_verified"] } },
    petition_signature: { act: "anyone", signMin: "quick", officialCount: { tiers: ["identity_verified", "residency_verified"] } },
  },
  // Graduation (Part 6 #9): forced poll at a fixed signature count; no early promotion role here.
  graduation: { threshold: { kind: "fixed", n: 100 }, officialEarlyPromotion: false },
  leader: { name: oursayGlobalPlatformSeat.name, handle: oursayGlobalPlatformSeat.seatHandle },
  rulesCopy: [
    "Open policy — any member may post any root type.",
    "Statements, Petitions and Polls are open to all.",
    "Verified posts are written to the public ledger.",
    "Unverified posts stay off-ledger.",
    "Counts appear once past the k-anonymity floor.",
  ],
};
