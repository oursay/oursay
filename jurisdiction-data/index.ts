// @oursay/jurisdiction-data — the registerable source of truth for per-jurisdiction config: gating
// rules, privacy floor, and public count-exposure policy. The API's composition root imports
// `jurisdictions` and registers each into the @oursay/public-record router (`registerJurisdiction`) at
// startup, so every thread's `audienceScope.jurisdiction` resolves to the right policy on read. Env
// (`JURISDICTION_ID`) still selects the DEFAULT id; the rules themselves live here, not in api/config.
import type { JurisdictionConfig } from "@oursay/public-record";
import { abCaGov } from "./ab-ca-gov/jurisdiction.js";
import { oursayGlobal } from "./oursay-global/jurisdiction.js";

export const jurisdictions: JurisdictionConfig[] = [oursayGlobal, abCaGov];

export { abCaGov, oursayGlobal };
