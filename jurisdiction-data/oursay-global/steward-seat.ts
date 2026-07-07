import type { OfficialSeatRecord } from "../lib/official-seats.js";
import { jurisdictionLeaderSeatHandle } from "../lib/slugs.js";

/** Display line for the global jurisdiction leader — role · jurisdiction. */
export const GLOBAL_PLATFORM_LEADER_LINE = "Platform · Global";

/** Global jurisdiction leader seat (role key: platform). */
export const oursayGlobalPlatformSeat: OfficialSeatRecord = {
  seatHandle: jurisdictionLeaderSeatHandle("global", "platform"),
  seatKind: "jurisdiction_leader",
  jurisdictionId: "oursay-global",
  jurisdictionShortSlug: "global",
  title: GLOBAL_PLATFORM_LEADER_LINE,
  name: "OurSay Stewards",
  role: GLOBAL_PLATFORM_LEADER_LINE,
  leaderRole: "platform",
  districtSlug: null,
  districtShortSlug: null,
  source: "manual",
  claimedUserHandle: "oursay",
};

/** @deprecated Use {@link oursayGlobalPlatformSeat}. */
export const oursayGlobalStewardSeat = oursayGlobalPlatformSeat;
