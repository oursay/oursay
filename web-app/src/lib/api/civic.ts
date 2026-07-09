/**
 * Browser civic write client — join → prepare → sign → submit via @oursay/identity.
 * Only available in live mode (not mock-only) and only in the browser.
 */

import type { ThreadRef } from "@oursay/identity";
import type {
  CommentContent,
  EntityRules,
  PetitionContent,
  PollContent,
  PostContent,
  ReactionContent,
  VoteContent,
} from "@oursay/public-record/schema/types";
import type { RecordKind } from "@/lib/types";
import { isMockOnly } from "./client";
import { parentTypeForKind, type CivicSignMode } from "./civic-helpers";
import { loadCustodySession, clearCachedCustodySession } from "./civic-custody";
import { getRecordStates } from "./me";
import { CivicHttpError } from "@oursay/identity/client/browser";
import { notifyCivicPasskeyPhase } from "./civic-passkey-phase";

export type { CivicSignMode } from "./civic-helpers";

function passkeyAppendOpts(sign: CivicSignMode) {
  return sign === "passkey"
    ? { sign, onThreadPasskeyPhase: notifyCivicPasskeyPhase }
    : { sign };
}

let civicPromise: Promise<{
  client: import("@oursay/identity/client/browser").CivicHttpClient;
  userId: string;
}> | null = null;

async function loadCivic(userId: string) {
  const { CivicHttpClient } = await import("@oursay/identity/client/browser");
  const session = await loadCustodySession(userId);
  const client = new CivicHttpClient({
    baseUrl: "",
    session,
    credentials: "include",
  });
  return { client, userId };
}

/** Drop the cached civic client (e.g. on logout). */
export function resetCivicClient(): void {
  civicPromise = null;
  clearCachedCustodySession();
}

/** Lazily establish the civic signing client (reuses custody session warmed at login). */
export async function getCivicClient(userId: string) {
  if (isMockOnly() || typeof window === "undefined") {
    throw new Error("Civic client unavailable in mock or SSR context");
  }
  if (!civicPromise) civicPromise = loadCivic(userId);
  return civicPromise;
}

export function threadRef(threadId: string, jurisdiction: string): ThreadRef {
  return { threadId, jurisdiction };
}

function districtRules(slugs?: string[]): EntityRules | undefined {
  if (!slugs?.length) return undefined;
  return { appliesToDistrictIds: slugs };
}

function isSingletonReactionConflict(err: unknown): boolean {
  if (!(err instanceof CivicHttpError)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.status === 400 &&
    (msg.includes("singleton") ||
      msg.includes("already has an active reaction") ||
      msg.includes("update instead"))
  );
}

function isMissingReactionEntity(err: unknown): boolean {
  if (!(err instanceof CivicHttpError)) return false;
  const msg = err.message.toLowerCase();
  return err.status === 400 && (msg.includes("not found") || msg.includes("entity "));
}

async function reactionEntityIdForParent(
  parentId: string,
  hint?: string,
): Promise<string | undefined> {
  if (hint) return hint;
  const states = await getRecordStates([parentId]);
  return states[parentId]?._myEntityId ?? undefined;
}

export async function civicReaction(
  userId: string,
  t: ThreadRef,
  parentId: string,
  parentType: "post" | "petition" | "poll" | "comment",
  kind: "check" | "cross",
  existingEntityId?: string,
  sign: CivicSignMode = "quick",
): Promise<string> {
  const { client } = await getCivicClient(userId);
  const content: ReactionContent = { kind };
  const parent = { id: parentId, type: parentType };

  let entityId = await reactionEntityIdForParent(parentId, existingEntityId);

  const updateReaction = () =>
    client.append(
      t,
      { op: "update", type: "reaction", entityId: entityId!, content },
      passkeyAppendOpts(sign),
    );

  const createReaction = () => client.addReaction(t, parent, content, passkeyAppendOpts(sign));

  if (entityId) {
    try {
      const ref = await updateReaction();
      return ref.entityId;
    } catch (err) {
      if (!isMissingReactionEntity(err)) throw err;
      entityId = undefined;
    }
  }

  try {
    const ref = await createReaction();
    return ref.entityId;
  } catch (err) {
    if (!isSingletonReactionConflict(err)) throw err;
    const resolved = await reactionEntityIdForParent(parentId);
    if (!resolved) throw err;
    entityId = resolved;
    const ref = await updateReaction();
    return ref.entityId;
  }
}

export async function civicVote(
  userId: string,
  t: ThreadRef,
  pollId: string,
  option: string,
  sign: CivicSignMode = "passkey",
): Promise<void> {
  const { client } = await getCivicClient(userId);
  const content: VoteContent = { option };
  await client.castVote(t, { id: pollId, type: "poll" }, content, passkeyAppendOpts(sign));
}

export async function civicComment(
  userId: string,
  t: ThreadRef,
  parentId: string,
  parentType: "post" | "petition" | "poll" | "comment",
  body: string,
  sign: CivicSignMode = "quick",
): Promise<string | null> {
  const { client } = await getCivicClient(userId);
  const content: CommentContent = { body };
  await client.createComment(
    t,
    { id: parentId, type: parentType },
    content,
    passkeyAppendOpts(sign),
  );
  return client.personaDisplayName(t);
}

export async function civicSignPetition(
  userId: string,
  t: ThreadRef,
  petitionId: string,
  sign: CivicSignMode = "passkey",
): Promise<void> {
  const { client } = await getCivicClient(userId);
  await client.append(
    t,
    {
      op: "create",
      type: "petition_signature",
      entityId: crypto.randomUUID(),
      parent: { type: "petition", id: petitionId },
      content: {},
    },
    passkeyAppendOpts(sign),
  );
}

export async function civicCompose(
  userId: string,
  t: ThreadRef,
  kind: RecordKind,
  payload: {
    title: string;
    body: string;
    pollOptions?: string[];
    districtSlugs?: string[];
  },
  sign: CivicSignMode = "passkey",
): Promise<{ entityId: string; personaName: string | null }> {
  const { client } = await getCivicClient(userId);
  const rules = districtRules(payload.districtSlugs);
  if (kind === "statement") {
    const content: PostContent & { rules?: EntityRules } = {
      title: payload.title,
      body: payload.body,
      ...(rules ? { rules } : {}),
    };
    const ref = rules
      ? await client.append(
          t,
          { op: "create", type: "post", entityId: t.threadId, content },
          passkeyAppendOpts(sign),
        )
      : await client.createPost(t, { title: payload.title, body: payload.body }, passkeyAppendOpts(sign));
    return { entityId: ref.entityId, personaName: client.personaDisplayName(t) };
  }
  if (kind === "petition") {
    const content: PetitionContent = {
      title: payload.title,
      text: payload.body,
      ...(rules ? { rules } : {}),
    };
    const ref = await client.append(
      t,
      { op: "create", type: "petition", entityId: t.threadId, content },
      passkeyAppendOpts(sign),
    );
    return { entityId: ref.entityId, personaName: client.personaDisplayName(t) };
  }
  if (kind === "poll") {
    const options = (payload.pollOptions ?? []).map((o) => o.trim()).filter(Boolean);
    const content: PollContent = {
      question: payload.title,
      options: options.length >= 2 ? options : ["Yes", "No"],
      ...(rules ? { rules } : {}),
    };
    const ref = await client.append(
      t,
      { op: "create", type: "poll", entityId: t.threadId, content },
      passkeyAppendOpts(sign),
    );
    return { entityId: ref.entityId, personaName: client.personaDisplayName(t) };
  }
  throw new Error(`Cannot compose record kind ${kind}`);
}

/** Thread + parent refs for a civic target (feed row or detail). */
export function civicRefsForTarget(target: {
  id: string;
  kind?: RecordKind;
  threadId?: string;
  parentType?: "post" | "petition" | "poll" | "comment";
  jurisdiction: string;
}): { thread: ThreadRef; parent: { id: string; type: "post" | "petition" | "poll" | "comment" } } {
  const threadId = target.threadId ?? target.id;
  const parentType =
    target.parentType ?? (target.kind ? parentTypeForKind(target.kind) : "post");
  return {
    thread: threadRef(threadId, target.jurisdiction),
    parent: { id: target.id, type: parentType },
  };
}
