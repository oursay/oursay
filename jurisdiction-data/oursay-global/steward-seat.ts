import { GLOBAL_PLATFORM_LEADER_LINE, GLOBAL_PLATFORM_SEAT } from "@oursay/slugs";
import type { OfficialSeatRecord } from "../lib/official-seats.js";

export { GLOBAL_PLATFORM_LEADER_LINE };

/** Global jurisdiction leader seat (role key: platform). Identity comes from the shared
 *  {@link GLOBAL_PLATFORM_SEAT} constants; this layer adds the catalog-record-specific fields. */
export const oursayGlobalPlatformSeat: OfficialSeatRecord = {
  seatHandle: GLOBAL_PLATFORM_SEAT.seatHandle,
  seatKind: GLOBAL_PLATFORM_SEAT.seatKind,
  jurisdictionId: GLOBAL_PLATFORM_SEAT.jurisdictionId,
  jurisdictionShortSlug: GLOBAL_PLATFORM_SEAT.jurisdictionShortSlug,
  title: GLOBAL_PLATFORM_SEAT.title,
  name: GLOBAL_PLATFORM_SEAT.name,
  role: GLOBAL_PLATFORM_SEAT.role,
  leaderRole: GLOBAL_PLATFORM_SEAT.leaderRole,
  districtSlug: null,
  districtShortSlug: null,
  source: "manual",
  claimedUserHandle: GLOBAL_PLATFORM_SEAT.claimedUserHandle,
};
