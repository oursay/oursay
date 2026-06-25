import type { JurisdictionConfig } from "@oursay/public-record";

// oursay-global — the universal OurSay record and OPEN SANDBOX jurisdiction. Permissive by design:
// votes and signatures are publicly exposable with no tier gate, and change/revoke are allowed so
// dev/CI can iterate freely. The k-anonymity floor is left unset (uses the platform default); dev/CI
// relaxation is done through the platform-min env (PUBLIC_COUNTS_K_ANONYMITY_MIN), never by lowering a
// jurisdiction floor (a jurisdiction may only RAISE it).
export const oursayGlobal: JurisdictionConfig = {
  id: "oursay-global",
  level: "federal",
  rules: {
    allowChange: true,
    allowRevoke: true,
  },
  counts: {
    votes: true,
    signatures: true,
  },
};
