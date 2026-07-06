/**
 * Browser civic write client — join → prepare → sign → submit via @oursay/identity.
 * Only available in live mode (not mock-only) and only in the browser.
 */

import type { SignMode, ThreadRef } from "@oursay/identity";
import type { CommentContent, PostContent, ReactionContent, VoteContent } from "@oursay/public-record/schema/types";
import { isMockOnly } from "./client";

export type CivicSignMode = SignMode;

let civicPromise: Promise<{
  client: import("@oursay/identity/client").CivicHttpClient;
  userId: string;
}> | null = null;

async function loadCivic(userId: string) {
  const { WebPasskeyConnector, IdentitySession, CivicHttpClient } = await import(
    "@oursay/identity/client"
  );
  const conn = new WebPasskeyConnector({ rpId: "localhost" });
  const cred = await conn.enrollDevice({ userId, label: "web-app civic" });
  const session = new IdentitySession(
    await conn.unlock({ userId, deviceId: cred.deviceId }),
  );
  const client = new CivicHttpClient({
    baseUrl: "",
    session,
    credentials: "include",
  });
  return { client, userId };
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

export async function civicPost(
  userId: string,
  t: ThreadRef,
  content: PostContent,
  sign: CivicSignMode = "passkey",
): Promise<void> {
  const { client } = await getCivicClient(userId);
  await client.createPost(t, content, { sign });
}
