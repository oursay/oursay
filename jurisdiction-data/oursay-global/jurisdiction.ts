import type { JurisdictionConfig } from "@oursay/public-record";
import { DEFAULT_CONTENT_LIMITS, DEFAULT_LABELS } from "@oursay/public-record";

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
};
