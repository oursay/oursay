import { DETAIL_BY_ID, person, personDistricts, THREAD_VISIBILITY_OVERRIDES } from "@/lib/mock";
import type { PostTypeEntry } from "@/lib/mock";
import {
  buildPersonaMap,
  isRevealed,
  personaNameFor,
  resolveVisibility,
} from "@/lib/read-model";
import type {
  AuthorIdentity,
  AuthorVisibility,
  CommentNode,
  FeedItem,
  RecordDetail,
  ViewerContext,
} from "@/lib/types";

/**
 * Viewer-dependent author-identity resolution — the demo's read-path
 * enforcement of docs/09-ACCOUNT-PRIVACY-MODEL.md. Every DTO the frontend API
 * serves passes through here so real handles never reach components for
 * authors whose visibility excludes the viewer; they get the per-thread
 * persona instead.
 *
 * Deliberate demo semantics: only the identity surface (name, handle, profile
 * link, avatar seed) is masked. The verification-tier pill, the comment's
 * `districts` (home-author glyph), and all tallies stay — those are anonymized
 * civic signals per docs/09 §1, not identity.
 */

/**
 * Persona assignment is built once over the whole corpus with a single shared
 * name space, so a persona name is globally unique and `/persona/<name>`
 * resolves from the name alone. Threads are processed in sorted order so the
 * result is deterministic across reloads.
 */
interface PersonaIndex {
  byThread: Map<string, Map<string, string>>;
  /** persona name -> owning (handle, thread). */
  reverse: Map<string, { handle: string; threadId: string }>;
  usedNames: Set<string>;
}

let personaIndex: PersonaIndex | null = null;

function collectHandles(nodes: CommentNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(node.handle);
    collectHandles(node.replies, into);
  }
}

function buildPersonaIndex(): PersonaIndex {
  const byThread = new Map<string, Map<string, string>>();
  const reverse = new Map<string, { handle: string; threadId: string }>();
  const usedNames = new Set<string>();

  for (const threadId of Object.keys(DETAIL_BY_ID).sort()) {
    const entry: PostTypeEntry = DETAIL_BY_ID[threadId];
    const handles = new Set<string>([entry.post.handle]);
    collectHandles(entry.comments, handles);
    const map = buildPersonaMap([...handles], threadId, personaNameFor, usedNames);
    byThread.set(threadId, map);
    for (const [handle, name] of map) reverse.set(name, { handle, threadId });
  }
  return { byThread, reverse, usedNames };
}

function getPersonaIndex(): PersonaIndex {
  if (!personaIndex) personaIndex = buildPersonaIndex();
  return personaIndex;
}

/** Viewer-independent persona assignment for every participant in a thread. */
export function personaMapForThread(threadId: string): Map<string, string> {
  return getPersonaIndex().byThread.get(threadId) ?? new Map();
}

/** The persona shown for `handle` within `threadId` (roster map, else direct seed). */
export function personaFor(handle: string, threadId: string): string {
  const index = getPersonaIndex();
  const fromRoster = index.byThread.get(threadId)?.get(handle);
  if (fromRoster) return fromRoster;
  // Off-roster author (e.g. a synthesized mention): assign against the global
  // name space and register so the persona page resolves it too.
  let digits = 2;
  let name = personaNameFor(handle, threadId, digits);
  while (
    index.usedNames.has(name) &&
    (index.reverse.get(name)?.handle !== handle ||
      index.reverse.get(name)?.threadId !== threadId)
  ) {
    digits += 1;
    name = personaNameFor(handle, threadId, digits);
  }
  index.usedNames.add(name);
  index.reverse.set(name, { handle, threadId });
  return name;
}

/** Resolve a persona name back to its (handle, thread) — persona-page lookup. */
export function lookupPersona(
  personaName: string,
): { handle: string; threadId: string } | null {
  return getPersonaIndex().reverse.get(personaName) ?? null;
}

function effectiveVisibility(handle: string, threadId: string): AuthorVisibility {
  const account = person(handle).visibility ?? "public";
  const override = THREAD_VISIBILITY_OVERRIDES[threadId]?.[handle];
  return resolveVisibility(account, override);
}

/** Resolve how `handle` appears to `viewer` within one thread. */
export function resolveAuthorIdentity(
  handle: string,
  displayName: string,
  threadId: string,
  viewer: ViewerContext,
): AuthorIdentity {
  if (viewer.selfHandle && handle.toLowerCase() === viewer.selfHandle.toLowerCase()) {
    const ownVisibility = resolveVisibility(
      viewer.selfVisibility ?? "anonymous",
      THREAD_VISIBILITY_OVERRIDES[threadId]?.[handle],
    );
    return {
      display: displayName,
      handle,
      isPersona: false,
      isSelf: true,
      seed: handle,
      threadId,
      seenByOthersAs:
        ownVisibility === "public" ? undefined : personaFor(handle, threadId),
    };
  }

  const revealed = isRevealed(
    effectiveVisibility(handle, threadId),
    personDistricts(handle),
    viewer,
  );
  if (revealed) {
    return {
      display: displayName,
      handle,
      isPersona: false,
      isSelf: false,
      seed: handle,
      threadId,
    };
  }

  const persona = personaFor(handle, threadId);
  return {
    display: persona,
    handle: null,
    isPersona: true,
    isSelf: false,
    seed: persona,
    threadId,
  };
}

/**
 * Copy a feed/list item with its author surface anonymized for this viewer.
 * A card's thread is the record itself, so the card persona matches the
 * detail-page persona.
 */
export function anonymizeFeedItem(item: FeedItem, viewer: ViewerContext): FeedItem {
  const identity = resolveAuthorIdentity(item.handle, item.author, item.id, viewer);
  return {
    ...item,
    author: identity.display,
    handle: identity.handle ?? identity.display,
    identity,
  };
}

function anonymizeComments(
  nodes: CommentNode[],
  threadId: string,
  viewer: ViewerContext,
): CommentNode[] {
  return nodes.map((node) => {
    const identity = resolveAuthorIdentity(node.handle, node.author, threadId, viewer);
    return {
      ...node,
      author: identity.display,
      handle: identity.handle ?? identity.display,
      identity,
      replies: anonymizeComments(node.replies, threadId, viewer),
    };
  });
}

/** Anonymize a record detail plus a (possibly pre-filtered) comment tree. */
export function anonymizeRecordEntry(
  detail: RecordDetail,
  comments: CommentNode[],
  viewer: ViewerContext,
): { detail: RecordDetail; comments: CommentNode[] } {
  const identity = resolveAuthorIdentity(detail.handle, detail.author, detail.id, viewer);
  return {
    detail: {
      ...detail,
      author: identity.display,
      handle: identity.handle ?? identity.display,
      identity,
    },
    comments: anonymizeComments(comments, detail.id, viewer),
  };
}
