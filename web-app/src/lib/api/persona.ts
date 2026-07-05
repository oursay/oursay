import { DETAIL_BY_ID, person } from "@/lib/mock";
import { hashSeed } from "@/lib/mock/comment-utils";
import type {
  ActivityItem,
  CommentNode,
  MentionItem,
  ProfileSupport,
  RecordKind,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";
import { ANON_VIEWER } from "@/lib/types";
import {
  lookupPersona,
  personaMapForThread,
  resolveAuthorIdentity,
} from "./identity";

/**
 * A persona's profile — the anonymous mirror of PublicProfile, scoped to one
 * thread (docs/entities/civic-identity/thread-persona.md). Never exposes the
 * real handle; everything shown is derivable from the thread itself.
 */
export interface PersonaProfile {
  /** The persona name (globally unique — doubles as the route segment). */
  name: string;
  threadId: string;
  threadKind: RecordKind;
  threadTitle: string;
  /** Verification tier stays visible (civic signal, not identity). */
  tier: VerificationTier;
  bio: string;
  /** Support-bar caption suffix ("N% Support over <ageLabel>"). */
  ageLabel: string;
  support: ProfileSupport;
  /** Their comments within this thread (authors rewritten to the persona). */
  comments: CommentNode[];
  /** Non-comment thread activity: the root post, edits, reactions, votes. */
  activity: ActivityItem[];
  /** In-thread mentions of this persona by other participants. */
  mentions: MentionItem[];
}

const PERSONA_BIO =
  "This member participates here under a per-thread pseudonym. Their identity, profile, and activity elsewhere stay private.";

function truncateTitle(title: string, max = 42): string {
  return title.length <= max ? title : `${title.slice(0, max)}…`;
}

function collectComments(
  nodes: CommentNode[],
  handle: string,
  personaName: string,
  threadId: string,
  into: CommentNode[],
): void {
  for (const node of nodes) {
    if (node.handle === handle) {
      into.push({
        ...node,
        author: personaName,
        handle: personaName,
        identity: {
          display: personaName,
          handle: null,
          isPersona: true,
          isSelf: false,
          seed: personaName,
          threadId,
        },
        replies: [],
      });
    }
    collectComments(node.replies, handle, personaName, threadId, into);
  }
}

/** Seeded non-comment activity within the thread (reactions/votes/signs). */
function generateThreadActivity(
  personaName: string,
  threadId: string,
  threadKind: RecordKind,
  threadTitle: string,
  isAuthor: boolean,
  editedComments: number,
): ActivityItem[] {
  const seed = hashSeed(`${personaName}::${threadId}::activity`);
  const title = truncateTitle(threadTitle);
  const items: ActivityItem[] = [];

  if (isAuthor) {
    items.push({
      kind: threadKind === "result" ? "statement" : threadKind,
      text: `Posted “${title}”`,
      meta: `${1 + (seed % 6)}d`,
      recordId: threadId,
    });
  }
  for (let i = 0; i < editedComments; i++) {
    items.push({
      kind: "comment",
      icon: "#ic-edit",
      text: `Edited a comment on “${title}”`,
      meta: `${1 + ((seed + i) % 5)}d`,
      recordId: threadId,
    });
  }
  // One seeded in-thread civic action matching the record type.
  if (threadKind === "petition" && !isAuthor) {
    items.push({
      kind: "petition",
      text: `Signed “${title}”`,
      meta: `${2 + (seed % 5)}d`,
      recordId: threadId,
    });
  } else if (threadKind === "poll") {
    items.push({
      kind: "poll",
      text: `Voted in “${title}”`,
      meta: `${2 + (seed % 5)}d`,
      recordId: threadId,
    });
  } else if (!isAuthor) {
    items.push({
      kind: "reaction",
      icon: seed % 3 === 0 ? "#ic-x" : "#ic-check",
      text: `${seed % 3 === 0 ? "Disagreed" : "Agreed"} with “${title}”`,
      meta: `${2 + (seed % 5)}d`,
      recordId: threadId,
    });
  }
  return items;
}

/** Seeded in-thread mentions by other participants, resolved for the viewer. */
function generateThreadMentions(
  personaName: string,
  handle: string,
  threadId: string,
  threadTitle: string,
  viewer: ViewerContext,
): MentionItem[] {
  const roster = [...personaMapForThread(threadId).keys()]
    .filter((h) => h !== handle)
    .sort();
  if (roster.length === 0) return [];

  const seed = hashSeed(`${personaName}::${threadId}::mentions`);
  const texts = [
    `@${personaName} makes a fair point here`,
    `Agree with @${personaName} on this`,
    `@${personaName} — do you have a source for that?`,
  ];
  const count = seed % 3; // 0-2 mentions
  const items: MentionItem[] = [];
  for (let i = 0; i < count; i++) {
    const otherHandle = roster[(seed + i * 3) % roster.length];
    const identity = resolveAuthorIdentity(
      otherHandle,
      person(otherHandle).name,
      threadId,
      viewer,
    );
    items.push({
      author: identity.display,
      handle: identity.handle ?? identity.display,
      identity,
      text: texts[(seed + i) % texts.length],
      meta: `on “${truncateTitle(threadTitle)}” · ${1 + ((seed + i) % 6)}d`,
      recordId: threadId,
    });
  }
  return items;
}

/**
 * Resolve a persona profile from its (globally unique) name. Unknown names
 * and real handles both resolve null — the caller renders the same not-found
 * state (hide existence, docs/09 §3). The persona→profile link never exists.
 */
export async function getPersonaProfile(
  personaName: string,
  viewer: ViewerContext = ANON_VIEWER,
): Promise<PersonaProfile | null> {
  const owner = lookupPersona(personaName);
  if (!owner) return null;
  const entry = DETAIL_BY_ID[owner.threadId];
  if (!entry) return null;

  const { handle, threadId } = owner;
  const isAuthor = entry.post.handle === handle;

  const comments: CommentNode[] = [];
  collectComments(entry.comments, handle, personaName, threadId, comments);

  let agrees = comments.reduce((n, c) => n + c.up, 0);
  let disagrees = comments.reduce((n, c) => n + c.down, 0);
  if (isAuthor) {
    agrees += entry.post.up ?? 0;
    disagrees += entry.post.down ?? 0;
  }

  const tier: VerificationTier = isAuthor
    ? entry.post.tier
    : (comments[0]?.tier ?? person(handle).tier);

  return {
    name: personaName,
    threadId,
    threadKind: entry.post.kind,
    threadTitle: entry.post.title,
    tier,
    bio: PERSONA_BIO,
    ageLabel: "this thread",
    support: {
      agrees,
      disagrees,
      statements: 0, // persona pill shows comment count only
      comments: comments.length,
    },
    comments,
    activity: generateThreadActivity(
      personaName,
      threadId,
      entry.post.kind,
      entry.post.title,
      isAuthor,
      comments.filter((c) => (c.edits ?? 0) > 0).length,
    ),
    mentions: generateThreadMentions(
      personaName,
      handle,
      threadId,
      entry.post.title,
      viewer,
    ),
  };
}
