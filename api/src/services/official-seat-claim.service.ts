// Platform-only official seat claims — links geo.official_seats to auth.jurisdiction_memberships.
// Jurisdiction comes from the seat row (never hardcoded) so any ingested roster works.
//
// Mutable apply methods are the projection step AFTER a successful platform-ops append. Prefer
// PlatformOpsService.prepare/submit (or submitWithOpsSoftKey for CLI) as the public write path.

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
   * Apply a claimed seat after a platform-ops `official_seat_claim` append.
   * Prefer {@link PlatformOpsService} for the signed write path.
   */
  async applyClaimSeat(userId: string, seatHandle: string, asOf: Date = new Date()): Promise<void> {
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

  /**
   * Apply a seat release after a platform-ops `official_seat_revoke` append.
   * Prefer {@link PlatformOpsService} for the signed write path.
   */
  async applyReleaseSeat(
    seatHandle: string,
    opts: { expectedUserHandle?: string; expectedUserId?: string } = {},
    asOf: Date = new Date(),
  ): Promise<void> {
    const seat = await this.d.geoStore.getOfficialSeatByHandle(seatHandle, asOf);
    if (!seat) throw new ServiceError("not_found", `official seat not found: ${seatHandle}`);

    const claimed = seat.claimedUserHandle?.replace(/^@/, "").trim() ?? null;
    if (!claimed) return;

    if (opts.expectedUserHandle) {
      const expected = normalizeHandle(opts.expectedUserHandle);
      if (!expected || claimed !== expected) {
        throw new ServiceError(
          "conflict",
          `seat ${seatHandle} is claimed by @${claimed}, not @${expected ?? opts.expectedUserHandle}`,
        );
      }
    }

    if (opts.expectedUserId) {
      const expectedUser = await this.d.userRepo.getById(opts.expectedUserId);
      const expectedHandle = expectedUser ? normalizeHandle(expectedUser.handle) : null;
      if (!expectedHandle || claimed !== expectedHandle) {
        throw new ServiceError(
          "conflict",
          `seat ${seatHandle} is claimed by @${claimed}, not user ${opts.expectedUserId}`,
        );
      }
    }

    await this.d.geoStore.upsertOfficialSeat(seatRowToUpsert(seat, null));

    const user = await this.d.userRepo.getByHandle(claimed);
    if (!user) return;

    const remaining = (
      await this.d.geoStore.listOfficialSeatsByClaimedUserHandle(claimed, asOf)
    ).filter((s) => s.jurisdictionId === seat.jurisdictionId);

    if (remaining.length === 0) {
      await this.d.membershipRepo.setRole(user.id, seat.jurisdictionId, null);
      return;
    }

    const prefer = remaining.find((s) => s.districtSlug) ?? remaining[0]!;
    await this.d.membershipRepo.setRole(
      user.id,
      seat.jurisdictionId,
      "official",
      prefer.districtSlug,
    );
  }

  /** @deprecated Use PlatformOpsService + applyClaimSeat. Kept as alias for transitional call sites. */
  async claimSeat(userId: string, seatHandle: string, asOf: Date = new Date()): Promise<void> {
    return this.applyClaimSeat(userId, seatHandle, asOf);
  }

  /** @deprecated Use PlatformOpsService + applyReleaseSeat. Kept as alias for transitional call sites. */
  async releaseSeat(
    seatHandle: string,
    opts: { expectedUserHandle?: string; expectedUserId?: string } = {},
    asOf: Date = new Date(),
  ): Promise<void> {
    return this.applyReleaseSeat(seatHandle, opts, asOf);
  }
}

function seatRowToUpsert(seat: OfficialSeatRow, claimedUserHandle: string | null) {
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
