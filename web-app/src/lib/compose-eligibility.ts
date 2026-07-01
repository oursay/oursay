import type { RecordKind, VerificationTier } from "@/lib/types";

/** Root record types each jurisdiction exposes in compose (wireframe JUR_ROOTS). */
export const JUR_COMPOSE_ROOTS: Record<string, RecordKind[]> = {
  Global: ["statement", "petition", "poll"],
  Alberta: ["statement", "petition"],
};

export function rootTypesForJurisdiction(name: string): RecordKind[] {
  return JUR_COMPOSE_ROOTS[name] ?? ["statement", "petition"];
}

/** Polls are a Global root type only — Alberta polls graduate from petitions. */
export function isPollJurisdiction(jurisdiction: string): boolean {
  return jurisdiction === "Global";
}

/** Type picker / posting-in lock — tier or jurisdiction ladder rules. */
export function isComposeTypeLocked(
  jurisdiction: string,
  kind: RecordKind,
  kycTier: VerificationTier,
): boolean {
  if (!rootTypesForJurisdiction(jurisdiction).includes(kind)) return true;
  if (kind === "statement") return false;
  if (kind === "petition") {
    return jurisdiction === "Alberta" && kycTier < 2;
  }
  if (kind === "poll") {
    return !isPollJurisdiction(jurisdiction);
  }
  return false;
}

export function composeTypeLockReason(
  jurisdiction: string,
  kind: RecordKind,
  kycTier: VerificationTier,
): string | undefined {
  if (kind === "poll" && !isPollJurisdiction(jurisdiction)) return "type N/A";
  if (!rootTypesForJurisdiction(jurisdiction).includes(kind)) return "type N/A";
  if (kind === "petition" && jurisdiction === "Alberta" && kycTier < 2) {
    return "Residency-verified only";
  }
  return undefined;
}

export function canComposeInJurisdiction(
  jurisdiction: string,
  kind: RecordKind,
  kycTier: VerificationTier,
): boolean {
  return !isComposeTypeLocked(jurisdiction, kind, kycTier);
}
