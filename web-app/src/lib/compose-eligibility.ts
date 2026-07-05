import type {
  GateActor,
  JurisdictionId,
  RecordKind,
  VerificationTier,
} from "@/lib/types";
import { gateFor, gatedActionForKind } from "@/lib/mock/gates";

/**
 * Compose eligibility, derived entirely from the jurisdiction gate config
 * (M2/M3) — no jurisdiction-name switches. The viewer's tier + official role
 * are matched against each root type's `act` gate; a locked type shows the
 * reason the gate implies.
 */

/** The composable root kinds (Result is never composed — it graduates/auto-posts). */
export const COMPOSE_ROOT_KINDS: RecordKind[] = ["statement", "petition", "poll"];

/** The subset of the compose viewer the eligibility gates read. */
export interface ComposeViewer {
  kycTier: VerificationTier;
  /** Platform-assigned official role (orthogonal to KYC tier). */
  role?: "official";
}

/**
 * Root types the jurisdiction offers in the compose picker. Every modelled
 * jurisdiction offers all three roots; the `act` gate (not the offered set) is
 * what locks a type — Alberta polls are OFFERED but officials-only (M3), no
 * longer hidden as "type N/A".
 */
export function rootTypesForJurisdiction(
  _jurisdictionId: JurisdictionId,
): RecordKind[] {
  return COMPOSE_ROOT_KINDS;
}

/** The minimum tier in an actor's tier set (0 when not a tier gate). */
function minTier(tiers: VerificationTier[]): VerificationTier {
  return tiers.length ? (Math.min(...tiers) as VerificationTier) : 0;
}

/** Does the gate actor admit this viewer? Ladder-projected for the mock. */
export function actorAdmits(actor: GateActor, viewer: ComposeViewer): boolean {
  if (actor === "anyone") return true;
  if ("tiers" in actor) return viewer.kycTier >= minTier(actor.tiers);
  // Mock approximation: composing in a jurisdiction implies residing there, so
  // jurisdiction residency reduces to residency-verified (tier ≥ 2).
  if ("residencyIn" in actor) return viewer.kycTier >= 2;
  return viewer.role === "official";
}

/** Human reason a gate actor denies the viewer (undefined when it admits). */
function actorDenyReason(
  actor: GateActor,
  viewer: ComposeViewer,
): string | undefined {
  if (actorAdmits(actor, viewer)) return undefined;
  if (actor === "anyone") return undefined;
  if ("role" in actor) return "Officials only";
  if ("residencyIn" in actor) return "Residency-verified only";
  // tier set
  return minTier(actor.tiers) >= 2 ? "Residency-verified only" : "ID-verified only";
}

/** Whether the compose type is locked for this viewer in this jurisdiction. */
export function isComposeTypeLocked(
  jurisdictionId: JurisdictionId,
  kind: RecordKind,
  viewer: ComposeViewer,
): boolean {
  return !actorAdmits(gateFor(jurisdictionId, gatedActionForKind(kind)).act, viewer);
}

/** The short lock reason for a compose type (undefined when composable). */
export function composeTypeLockReason(
  jurisdictionId: JurisdictionId,
  kind: RecordKind,
  viewer: ComposeViewer,
): string | undefined {
  return actorDenyReason(gateFor(jurisdictionId, gatedActionForKind(kind)).act, viewer);
}

/** Convenience inverse of {@link isComposeTypeLocked}. */
export function canComposeInJurisdiction(
  jurisdictionId: JurisdictionId,
  kind: RecordKind,
  viewer: ComposeViewer,
): boolean {
  return !isComposeTypeLocked(jurisdictionId, kind, viewer);
}
