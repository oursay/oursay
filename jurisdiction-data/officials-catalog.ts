import type { OfficialSeatRecord, OfficialSeatsCatalog } from "./lib/official-seats.js";
import { abCaGovOfficialSeats } from "./ab-ca-gov/officials.js";
import { oursayGlobalPlatformSeat } from "./oursay-global/steward-seat.js";

export const officialSeatCatalogs: OfficialSeatsCatalog[] = [
  abCaGovOfficialSeats,
  {
    version: 1,
    jurisdictionId: "oursay-global",
    jurisdictionShortSlug: "global",
    pulledAt: "manual",
    source: "manual",
    seats: [oursayGlobalPlatformSeat],
  },
];

export function allOfficialSeats(): OfficialSeatRecord[] {
  return officialSeatCatalogs.flatMap((catalog) => catalog.seats);
}

export { abCaGovOfficialSeats, abCaGovJurisdictionLeader } from "./ab-ca-gov/officials.js";
export { oursayGlobalPlatformSeat, oursayGlobalStewardSeat } from "./oursay-global/steward-seat.js";
