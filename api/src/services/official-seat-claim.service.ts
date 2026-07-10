// Platform-only official seat claims — links geo.official_seats to auth.jurisdiction_memberships.

import type { GeoStore, OfficialSeatRow } from "@oursay/geo";
import { ServiceError } from "../errors.js";
import { normalizeHandle } from "../helpers/handle.js";
import type { MembershipRepo } from "../repo/membership.repo.js";
import type { UserRepo } from "../repo/user.repo.js";

export interface OfficialSeatClaimServiceDeps {
  geoStore: GeoStore;
  membershipRepo: MembershipRepo;
  userRepo: UserRepo;
}

export class OfficialSeatClaimService {
  constructor(private readonly d: OfficialSeatClaimServiceDeps) {}

  /**
   * Claim a roster seat for a user: set claimed_user_handle and assign the official role in the
   * seat's jurisdiction. represented_district_slug comes from the seat (null when seat has none).
   */
  async claimSeat(userId: string, seatHandle: string, asOf: Date = new Date()): Promise<void> {
    const user = await this.d.userRepo.getById(userId);
    if (!user) throw new ServiceError("not_found", `user not found: ${userId}`);

    const handle = normalizeHandle(user.handle);
    if (!handle) throw new ServiceError("validation", `invalid user handle: ${user.handle}`);

    const seat = await this.d.geoStore.getOfficialSeatByHandle(seatHandle, asOf);
    if (!seat) throw new ServiceError("not_found", `official seat not found: ${seatHandle}`);

    const existing = seat.claimedUserHandle?.replace(/^@/, "").trim() ?? null;
    if (existing && existing !== handle) {
      throw new ServiceError(
        "conflict",
        `seat ${seatHandle} is already claimed by @${existing}`,
      );
    }

    await this.d.geoStore.upsertOfficialSeat(seatRowToUpsert(seat, handle));
    await this.d.membershipRepo.add(userId, seat.jurisdictionId);
    await this.d.membershipRepo.setRole(
      userId,
      seat.jurisdictionId,
      "official",
      seat.districtSlug,
    );
  }
}

function seatRowToUpsert(seat: OfficialSeatRow, claimedUserHandle: string) {
  return {
    id: seat.id,
    jurisdictionId: seat.jurisdictionId,
    seatKind: seat.seatKind,
    title: seat.title,
    seatHandle: seat.seatHandle,
    districtSlug: seat.districtSlug,
    districtShortSlug: seat.districtShortSlug,
    leaderRole: seat.leaderRole,
    effectiveDate: seat.effectiveDate,
    boundaryYear: seat.boundaryYear,
    role: seat.role,
    representativeName: seat.representativeName,
    claimedUserHandle,
    source: seat.source,
  };
}
