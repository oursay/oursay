import type {
  GateActor,
  JurisdictionId,
  PlatformGateRole,
  RecordKind,
  VerificationTier,
} from "@/lib/types";
import {
  gateFor,
  gatedActionForKind,
  RECOGNIZED_ACCREDITATION_BODY_IDS,
} from "@/lib/mock/gates";

/**
 * Compose eligibility, derived entirely from the jurisdiction gate config
 * (M2/M3) — no jurisdiction-name switches. The viewer's tier + official role +
 * media body ids + platform roles are matched against each root type's `act`
 * gate; a locked type shows the reason the gate implies.
 */

/** The composable root kinds (Result is never composed — it graduates/auto-posts). */
export const COMPOSE_ROOT_KINDS: RecordKind[] = ["statement", "petition", "poll"];

/** The subset of the compose viewer the eligibility gates read. */
export interface ComposeViewer {
  kycTier: VerificationTier;
  /** Platform-assigned official role (orthogonal to KYC tier). */
  role?: "official";
  /** Valid Media accreditation-body catalog ids (from self profile). */
  accreditationBodyIds?: string[];
  /** Platform-scoped roles from session/account (`admin` today). */
  platformRoles?: PlatformGateRole[];
}

/**
 * Root types the jurisdiction offers in the compose picker. Every modelled
 * jurisdiction offers all three roots; the `act` gate (not the offered set) is
 * what locks a type — Alberta polls are OFFERED but role/media/admin-gated, no
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

function asActors(act: GateActor | GateActor[]): GateActor[] {
  return Array.isArray(act) ? act : [act];
}

/** Does one gate actor admit this viewer in this jurisdiction? */
export function actorAdmits(
  actor: GateActor,
  viewer: ComposeViewer,
  jurisdictionId?: JurisdictionId,
): boolean {
  if (actor === "anyone") return true;
  if ("tiers" in actor) return viewer.kycTier >= minTier(actor.tiers);
  // Mock approximation: composing in a jurisdiction implies residing there, so
  // jurisdiction residency reduces to residency-verified (tier ≥ 2).
  if ("residencyIn" in actor) return viewer.kycTier >= 2;
  if ("role" in actor) return viewer.role === "official";
  if ("mediaAccredited" in actor) {
    const recognized =
      (jurisdictionId && RECOGNIZED_ACCREDITATION_BODY_IDS[jurisdictionId]) ?? [];
    if (recognized.length === 0) return false;
    const bodies = viewer.accreditationBodyIds ?? [];
    return bodies.some((id) => recognized.includes(id));
  }
  if ("platformRole" in actor) {
    return (viewer.platformRoles ?? []).includes(actor.platformRole);
  }
  return false;
}

/** Does `act` (single or OR array) admit this viewer? */
export function actAdmits(
  act: GateActor | GateActor[],
  viewer: ComposeViewer,
  jurisdictionId?: JurisdictionId,
): boolean {
  return asActors(act).some((a) => actorAdmits(a, viewer, jurisdictionId));
}

function describeActor(actor: GateActor): string {
  if (actor === "anyone") return "any registered account";
  if ("tiers" in actor) {
    return minTier(actor.tiers) >= 2 ? "residency-verified" : "ID-verified";
  }
  if ("residencyIn" in actor) return "residency-verified";
  if ("role" in actor) return "officials";
  if ("mediaAccredited" in actor) return "accredited media";
  if ("platformRole" in actor) return `platform ${actor.platformRole}`;
  return "an allowed account";
}

/** Human reason a gate denies the viewer (undefined when it admits). */
function actDenyReason(
  act: GateActor | GateActor[],
  viewer: ComposeViewer,
  jurisdictionId: JurisdictionId,
): string | undefined {
  if (actAdmits(act, viewer, jurisdictionId)) return undefined;
  const actors = asActors(act);
  if (actors.length === 1) {
    const actor = actors[0]!;
    if (actor === "anyone") return undefined;
    if ("role" in actor) return "Officials only";
    if ("mediaAccredited" in actor) return "Accredited media only";
    if ("platformRole" in actor) return `Platform ${actor.platformRole} only`;
    if ("residencyIn" in actor) return "Residency-verified only";
    return minTier(actor.tiers) >= 2 ? "Residency-verified only" : "ID-verified only";
  }
  // Name the allowed set — never "Officials only" alone for an OR gate.
  const labels = actors.map(describeActor);
  const unique = [...new Set(labels)];
  if (unique.length === 1) return `${capitalize(unique[0]!)} only`;
  const last = unique.pop()!;
  return `${unique.map(capitalize).join(", ")} or ${last}`;
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Whether the compose type is locked for this viewer in this jurisdiction. */
export function isComposeTypeLocked(
  jurisdictionId: JurisdictionId,
  kind: RecordKind,
  viewer: ComposeViewer,
): boolean {
  return !actAdmits(
    gateFor(jurisdictionId, gatedActionForKind(kind)).act,
    viewer,
    jurisdictionId,
  );
}

/** The short lock reason for a compose type (undefined when composable). */
export function composeTypeLockReason(
  jurisdictionId: JurisdictionId,
  kind: RecordKind,
  viewer: ComposeViewer,
): string | undefined {
  return actDenyReason(
    gateFor(jurisdictionId, gatedActionForKind(kind)).act,
    viewer,
    jurisdictionId,
  );
}

/** Convenience inverse of {@link isComposeTypeLocked}. */
export function canComposeInJurisdiction(
  jurisdictionId: JurisdictionId,
  kind: RecordKind,
  viewer: ComposeViewer,
): boolean {
  return !isComposeTypeLocked(jurisdictionId, kind, viewer);
}
