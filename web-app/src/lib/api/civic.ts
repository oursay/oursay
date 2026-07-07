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
import { civicDeviceStorageKey, parentTypeForKind, type CivicSignMode } from "./civic-helpers";

export type { CivicSignMode } from "./civic-helpers";

let civicPromise: Promise<{
  client: import("@oursay/identity/client/browser").CivicHttpClient;
  userId: string;
}> | null = null;

async function loadCivic(userId: string) {
  const { WebPasskeyConnector, IdentitySession, CivicHttpClient } = await import(
    "@oursay/identity/client/browser"
  );
  const rpId = typeof location !== "undefined" ? location.hostname : "localhost";
  const conn = new WebPasskeyConnector({ rpId });

  const storageKey = civicDeviceStorageKey(userId);
  let deviceId = localStorage.getItem(storageKey) ?? undefined;

  if (deviceId) {
    try {
      const session = new IdentitySession(await conn.unlock({ userId, deviceId }));
      const client = new CivicHttpClient({
        baseUrl: "",
        session,
        credentials: "include",
      });
      return { client, userId };
    } catch {
      localStorage.removeItem(storageKey);
      deviceId = undefined;
    }
  }

  const cred = await conn.enrollDevice({ userId, label: "web-app civic", deviceId });
  localStorage.setItem(storageKey, cred.deviceId);
  const session = new IdentitySession(
    await conn.unlock({ userId, deviceId: cred.deviceId }),
  );
  const client = new CivicHttpClient({
    baseUrl: "",
    session,
    credentials: "include",
  });
  try {
    await client.enrollDevice("web-app");
  } catch {
    // Already enrolled on the server for this device pubkey.
  }
  return { client, userId };
}

/** Drop the cached civic client (e.g. on logout). */
export function resetCivicClient(): void {
  civicPromise = null;
}

/** Lazily establish the civic signing client (one unlock per page load). */
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

export async function civicReaction(
  userId: string,
  t: ThreadRef,
  parentId: string,
  parentType: "post" | "petition" | "poll" | "comment",
  kind: "check" | "cross",
  sign: CivicSignMode = "quick",
): Promise<void> {
  const { client } = await getCivicClient(userId);
  const content: ReactionContent = { kind };
  await client.addReaction(
    t,
    { id: parentId, type: parentType },
    content,
    { sign },
  );
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
  await client.castVote(t, { id: pollId, type: "poll" }, content, { sign });
}

export async function civicComment(
  userId: string,
  t: ThreadRef,
  parentId: string,
  parentType: "post" | "petition" | "poll" | "comment",
  body: string,
  sign: CivicSignMode = "quick",
): Promise<void> {
  const { client } = await getCivicClient(userId);
  const content: CommentContent = { body };
  await client.createComment(
    t,
    { id: parentId, type: parentType },
    content,
    { sign },
  );
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
    { sign },
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
): Promise<{ entityId: string }> {
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
          { sign },
        )
      : await client.createPost(t, { title: payload.title, body: payload.body }, { sign });
    return { entityId: ref.entityId };
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
      { sign },
    );
    return { entityId: ref.entityId };
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
      { sign },
    );
    return { entityId: ref.entityId };
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
