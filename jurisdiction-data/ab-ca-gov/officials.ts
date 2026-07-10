import type { OfficialSeatsCatalog } from "../lib/official-seats.js";
import abSeatsJson from "./leaders/opennorth/normalized/seats.json" with { type: "json" };
import jurisdictionLeaderJson from "./leaders/jurisdiction-leader.json" with { type: "json" };

export const abCaGovOfficialSeats = abSeatsJson as OfficialSeatsCatalog;

/** Premier seat record synced from Open North pull. */
export const abCaGovJurisdictionLeader = jurisdictionLeaderJson as {
  name: string;
  handle: string;
  role: string;
};
