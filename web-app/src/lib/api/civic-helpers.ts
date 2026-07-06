import type { RecordKind } from "@/lib/types";
import type { SignAction, SignMethod } from "@/lib/types";
import { effectiveSignMethod } from "@/lib/types";
import { jurisdictionSignRequirement } from "@/lib/mock";
import type { SignMode } from "@oursay/identity";

export type CivicSignMode = SignMode;

export type CivicParentType = "post" | "petition" | "poll" | "comment";

/** Map UI agree/disagree to wire reaction kinds. */
export function reactionKindForDir(dir: "up" | "down"): "check" | "cross" {
  return dir === "up" ? "check" : "cross";
}

/** Canonical parent type for a root record kind (results are read-only). */
export function parentTypeForKind(kind: RecordKind): CivicParentType {
  if (kind === "statement") return "post";
  if (kind === "petition") return "petition";
  if (kind === "poll") return "poll";
  return "post";
}

/** Resolve the signing mode for a civic append from prefs + optional chooser pick. */
export function resolveCivicSignMode(
  action: SignAction,
  jurisdiction: string,
  signing: Record<SignAction, SignMethod>,
  chosen?: CivicSignMode,
): CivicSignMode {
  if (chosen) return chosen;
  const method = effectiveSignMethod(
    signing[action],
    jurisdictionSignRequirement(jurisdiction, action),
  );
  return method === "quick" ? "quick" : "passkey";
}

export function civicDeviceStorageKey(userId: string): string {
  return `oursay/web-app/civic-device/${userId}`;
}
