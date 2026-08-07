// @oursay/jurisdiction-data — the registerable source of truth for per-jurisdiction config: gating
// rules, privacy floor, and public count-exposure policy. The API's composition root imports
// `jurisdictions` and registers each into the @oursay/public-record router (`registerJurisdiction`) at
// startup, so every thread's `audienceScope.jurisdiction` resolves to the right policy on read. Env
// (`JURISDICTION_ID`) still selects the DEFAULT id; the rules themselves live here, not in api/config.
import type { JurisdictionConfig } from "@oursay/public-record";
import {
  abCaGovAccreditationBodies,
  type PackagedAccreditationBody,
} from "./ab-ca-gov/accreditation-bodies.js";
import { abCaGov } from "./ab-ca-gov/jurisdiction.js";
import { oursayGlobal } from "./oursay-global/jurisdiction.js";

export const jurisdictions: JurisdictionConfig[] = [oursayGlobal, abCaGov];

export { abCaGov, oursayGlobal };
export {
  abCaGovAccreditationBodies,
  abCaGovRecognizedAccreditationBodyIds,
  type PackagedAccreditationBody,
} from "./ab-ca-gov/accreditation-bodies.js";

/** Packaged accreditation bodies for a jurisdiction (empty when none authored). */
export function accreditationBodiesFor(jurisdictionId: string): PackagedAccreditationBody[] {
  if (jurisdictionId === "ab-ca-gov") return abCaGovAccreditationBodies;
  return [];
}
export {
  abCaGovOfficialSeats,
  abCaGovJurisdictionLeader,
  allOfficialSeats,
  officialSeatCatalogs,
  oursayGlobalPlatformSeat,
} from "./officials-catalog.js";
export type { OfficialSeatRecord, OfficialSeatsCatalog } from "./lib/official-seats.js";
export {
  districtSeatHandle,
  districtShortSlug,
  districtSlug,
  jurisdictionLeaderSeatHandle,
} from "./lib/slugs.js";
export { isSeatClaimed, seatDisplayHandle, seatForDistrict, seatTitleFor, seatsByHandle } from "./lib/official-seats.js";
