import type { PrivateStore } from "./private/store.js";
import type { EntityRules } from "./schema/types.js";
import { getJurisdiction, type JurisdictionRules } from "./jurisdiction.js";

/** Extract the governance rules embedded in an entity's content (poll/petition). */
export function rulesOf(content: unknown): EntityRules {
  if (content && typeof content === "object" && "rules" in content) {
    const r = (content as { rules?: unknown }).rules;
    if (r && typeof r === "object") return r as EntityRules;
  }
  return {};
}

/**
 * Resolve the EFFECTIVE rules for an entity: the jurisdiction's defaults overlaid by the entity's
 * own overrides. The entity wins where it sets a value; otherwise the jurisdiction default applies
 * (and the absent/false floor remains FINAL-action semantics). The geographic stake is carried through
 * untouched — `appliesToRegion` (the canonical RegionRef) and its deprecated `appliesToDistrictIds`
 * alias both record which area the entity applies to (absent = whole jurisdiction), not a gate the
 * platform resolves here; the RegionResolver compiles them at filter time.
 */
export function resolveRules(base: JurisdictionRules, override: EntityRules): EntityRules {
  return {
    appliesToRegion: override.appliesToRegion,
    appliesToDistrictIds: override.appliesToDistrictIds,
    deadline: override.deadline ?? base.defaultDeadline,
    allowChange: override.allowChange ?? base.allowChange ?? false,
    allowRevoke: override.allowRevoke ?? base.allowRevoke ?? false,
  };
}

/** True if `now` is before the rules' deadline (or there is no deadline). */
export function withinDeadline(rules: EntityRules, now: Date = new Date()): boolean {
  if (!rules.deadline) return true;
  return now.getTime() < new Date(rules.deadline).getTime();
}

/**
 * Whether a vote on `pollEntityId` may be CHANGED right now. Resolved as the jurisdiction's default
 * rules ⊕ the poll's overrides: the default (no rules) is FALSE — a vote is cast final, the
 * real-world analog. A jurisdiction default or the poll's `rules.allowChange` + a future deadline
 * opt in. `jurisdictionId` selects the rule set; it defaults to the deployment's jurisdiction.
 */
export async function canChangeVote(
  store: PrivateStore,
  pollEntityId: string,
  now: Date = new Date(),
  jurisdictionId?: string,
): Promise<boolean> {
  const poll = await store.getEntityState(pollEntityId);
  if (!poll || poll.isDeleted) return false;
  const rules = resolveRules(getJurisdiction(jurisdictionId).rules, rulesOf(poll.content));
  return Boolean(rules.allowChange) && withinDeadline(rules, now);
}

/**
 * Whether a signature on `petitionEntityId` may be REVOKED right now. Resolved as the jurisdiction's
 * default rules ⊕ the petition's overrides. Default FALSE — a signature is final. A jurisdiction
 * default or the petition's `rules.allowRevoke` + a future deadline opt in.
 */
export async function canRevokeSignature(
  store: PrivateStore,
  petitionEntityId: string,
  now: Date = new Date(),
  jurisdictionId?: string,
): Promise<boolean> {
  const petition = await store.getEntityState(petitionEntityId);
  if (!petition || petition.isDeleted) return false;
  const rules = resolveRules(getJurisdiction(jurisdictionId).rules, rulesOf(petition.content));
  return Boolean(rules.allowRevoke) && withinDeadline(rules, now);
}
