import type { PrivateStore } from "./private/store.js";
import type { EntityRules } from "./schema/types.js";

/** Extract the governance rules embedded in an entity's content (poll/petition). */
export function rulesOf(content: unknown): EntityRules {
  if (content && typeof content === "object" && "rules" in content) {
    const r = (content as { rules?: unknown }).rules;
    if (r && typeof r === "object") return r as EntityRules;
  }
  return {};
}

/** True if `now` is before the rules' deadline (or there is no deadline). */
export function withinDeadline(rules: EntityRules, now: Date = new Date()): boolean {
  if (!rules.deadline) return true;
  return now.getTime() < new Date(rules.deadline).getTime();
}

/**
 * Whether a vote on `pollEntityId` may be CHANGED right now. Default (no rules) is FALSE — a
 * vote is cast final, the real-world analog. A poll's `rules.allowChange` + a future deadline
 * opt in (e.g. a riding that permits changing a vote before close).
 */
export async function canChangeVote(
  store: PrivateStore,
  pollEntityId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const poll = await store.getEntityState(pollEntityId);
  if (!poll || poll.isDeleted) return false;
  const rules = rulesOf(poll.content);
  return Boolean(rules.allowChange) && withinDeadline(rules, now);
}

/**
 * Whether a signature on `petitionEntityId` may be REVOKED right now. Default FALSE — a
 * signature is final, the real-world analog. `rules.allowRevoke` + a future deadline opt in.
 */
export async function canRevokeSignature(
  store: PrivateStore,
  petitionEntityId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const petition = await store.getEntityState(petitionEntityId);
  if (!petition || petition.isDeleted) return false;
  const rules = rulesOf(petition.content);
  return Boolean(rules.allowRevoke) && withinDeadline(rules, now);
}
