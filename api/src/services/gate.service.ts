// GateService: fail-closed per-action ACT-gate enforcement at the civic write path
// ([align-w3-gates-schema]; WEB-APP-GAPS Part 3 + Part 6). The jurisdiction config declares WHO may
// perform each action (`gates[action].act`); this service resolves the caller against that actor:
//   anyone                       → any registered account passes
//   { tiers }                    → set membership over the caller's CURRENT KYC tier
//   { residencyIn:"jurisdiction"}→ residency_verified AND current point inside the jurisdiction
//   { role:"official" }          → jurisdiction Official on membership — never a tier
//   { mediaAccredited:true }     → valid accreditation body ∈ recognizedAccreditationBodyIds
//   { platformRole }             → platform-wide role on auth.account_roles
// `act` may be a GateActor or GateActor[] (any-of / OR). `deny` enforcement is per action type
// (Part 6 #3): a denied VOTE is act-blocked here; a denied petition_signature is accepted on the
// record and excluded from official counts at READ time (reason tag `official_role`) — never blocked
// here. `officialCount` is a counting floor, never a participation barrier (Part 6 #2), so it is not
// consulted on the write path at all.
//
// Rejections carry a machine-readable `details.reason` so the client can render the right lock
// state (verify-tier prompt vs residency prompt vs official-only notice) instead of parsing prose.

import { gateFor, getJurisdiction } from "@oursay/public-record";
import type { GateActor, GatedAction } from "@oursay/public-record";
import { ServiceError } from "../errors.js";
import type { MediaAccreditationRepo } from "../repo/media-accreditation.repo.js";
import type { MembershipRepo } from "../repo/membership.repo.js";
import type { PlatformRole, PlatformRoleRepo } from "../repo/platform-role.repo.js";
import type { KycService } from "./kyc.service.js";
import type { ParticipantGeoService } from "./participant-geo.service.js";

/** Machine-readable lock reasons for the UI (details.reason on the 403). */
export type GateDenyReason =
  | "tier" // caller's tier is outside gates[action].act.tiers (details.requiredTiers)
  | "residency" // residencyIn gate: not residency_verified, or current point outside the jurisdiction
  | "role" // action reserved for the official role (or an OR set that includes it)
  | "media" // sole mediaAccredited gate failed
  | "official_role"; // caller holds a role the gate's deny list excludes (vote act-block)

export interface GateServiceDeps {
  kycService: KycService;
  participantGeoService: ParticipantGeoService;
  membershipRepo: MembershipRepo;
  mediaAccreditationRepo: MediaAccreditationRepo;
  platformRoleRepo: PlatformRoleRepo;
}

export class GateService {
  constructor(private readonly d: GateServiceDeps) {}

  /** Throw a 403 ServiceError unless `userId` may perform `action` in `jurisdictionId` right now.
   *  Fail-closed: an actor shape this build doesn't recognize denies. */
  async assertAct(userId: string, action: GatedAction, jurisdictionId: string): Promise<void> {
    const gate = gateFor(action, jurisdictionId);

    // deny → act-block for VOTE only (Part 6 #3); every other type's deny is a read-time count rule.
    if (action === "vote" && gate.deny) {
      for (const excluded of gate.deny) {
        if (await this.matchesActor(userId, excluded, jurisdictionId)) {
          throw this.denied(action, jurisdictionId, "official_role",
            "Officials are excluded from voting in this jurisdiction");
        }
      }
    }

    if (await this.matchesAct(userId, gate.act, jurisdictionId)) return;
    throw this.rejectionFor(gate.act, action, jurisdictionId);
  }

  /** Whether `userId` satisfies `act` (single actor or any-of / OR array). */
  async matchesAct(
    userId: string,
    act: GateActor | GateActor[],
    jurisdictionId: string,
  ): Promise<boolean> {
    const actors = Array.isArray(act) ? act : [act];
    for (const actor of actors) {
      if (await this.matchesActor(userId, actor, jurisdictionId)) return true;
    }
    return false;
  }

  /** Whether `userId` currently satisfies one GateActor (shared by the write path and official-count reads). */
  async matchesActor(userId: string, actor: GateActor, jurisdictionId: string): Promise<boolean> {
    if (actor === "anyone") return true;
    if (typeof actor !== "object" || actor === null) return false; // fail closed on unknown shapes
    if ("tiers" in actor) {
      const tier = await this.d.kycService.currentTier(userId);
      return actor.tiers.includes(tier);
    }
    if ("residencyIn" in actor) {
      // Residency = the residency tier AND a current point resolving to a district in the
      // jurisdiction (the same viewer-district resolution the my-district scope uses).
      const tier = await this.d.kycService.currentTier(userId);
      if (tier !== "residency_verified" && tier !== "electoral_validated") return false;
      return (await this.d.participantGeoService.viewerDistrictId(userId, jurisdictionId)) !== null;
    }
    if ("role" in actor) {
      return this.d.membershipRepo.hasRole(userId, jurisdictionId, actor.role);
    }
    if ("mediaAccredited" in actor) {
      const recognized = getJurisdiction(jurisdictionId).recognizedAccreditationBodyIds ?? [];
      if (recognized.length === 0) return false;
      const bodies = await this.d.mediaAccreditationRepo.listValidBodyIds(userId);
      return bodies.some((id) => recognized.includes(id));
    }
    if ("platformRole" in actor) {
      return this.d.platformRoleRepo.hasRole(userId, actor.platformRole as PlatformRole);
    }
    return false;
  }

  private rejectionFor(
    act: GateActor | GateActor[],
    action: GatedAction,
    jurisdictionId: string,
  ): ServiceError {
    const actors = Array.isArray(act) ? act : [act];
    if (actors.length === 1) {
      return this.rejectionForSingle(actors[0]!, action, jurisdictionId);
    }
    // OR list: keep reason `role` for the UI lock contract; message names the allowed set.
    return this.denied(
      action,
      jurisdictionId,
      "role",
      `This action requires: ${actors.map(describeActor).join(" or ")}`,
    );
  }

  private rejectionForSingle(
    actor: GateActor,
    action: GatedAction,
    jurisdictionId: string,
  ): ServiceError {
    if (typeof actor === "object" && actor !== null) {
      if ("tiers" in actor) {
        return this.denied(action, jurisdictionId, "tier",
          "This action requires a verified account in this jurisdiction", { requiredTiers: actor.tiers });
      }
      if ("residencyIn" in actor) {
        return this.denied(action, jurisdictionId, "residency",
          "This action requires verified residency inside this jurisdiction");
      }
      if ("role" in actor) {
        return this.denied(action, jurisdictionId, "role", "This action is reserved for officials");
      }
      if ("mediaAccredited" in actor) {
        return this.denied(action, jurisdictionId, "media",
          "This action requires media accreditation recognized in this jurisdiction");
      }
      if ("platformRole" in actor) {
        return this.denied(action, jurisdictionId, "role",
          `This action requires the platform ${actor.platformRole} role`);
      }
    }
    return this.denied(action, jurisdictionId, "role", "This action is not open to this account");
  }

  private denied(
    action: GatedAction,
    jurisdictionId: string,
    reason: GateDenyReason,
    message: string,
    extra: Record<string, unknown> = {},
  ): ServiceError {
    return new ServiceError("forbidden", message, { action, jurisdictionId, reason, ...extra });
  }
}

function describeActor(actor: GateActor): string {
  if (actor === "anyone") return "any registered account";
  if (typeof actor !== "object" || actor === null) return "an allowed account";
  if ("tiers" in actor) return `tier in [${actor.tiers.join(", ")}]`;
  if ("residencyIn" in actor) return "verified residency in this jurisdiction";
  if ("role" in actor) return "official role";
  if ("mediaAccredited" in actor) return "accredited media";
  if ("platformRole" in actor) return `platform ${actor.platformRole}`;
  return "an allowed account";
}
