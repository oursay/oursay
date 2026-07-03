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

/** Root-record participants -> persona names, cached (the mock corpus is static). */
const PERSONA_MAP_CACHE = new Map<string, Map<string, string>>();

function collectHandles(nodes: CommentNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(node.handle);
    collectHandles(node.replies, into);
  }
}

/** Viewer-independent persona assignment for every participant in a thread. */
export function personaMapForThread(threadId: string): Map<string, string> {
  const cached = PERSONA_MAP_CACHE.get(threadId);
  if (cached) return cached;

  const handles = new Set<string>();
  const entry: PostTypeEntry | undefined = DETAIL_BY_ID[threadId];
  if (entry) {
    handles.add(entry.post.handle);
    collectHandles(entry.comments, handles);
  }
  const map = buildPersonaMap([...handles], threadId);
  PERSONA_MAP_CACHE.set(threadId, map);
  return map;
}

/** The persona shown for `handle` within `threadId` (roster map, else direct seed). */
export function personaFor(handle: string, threadId: string): string {
  return personaMapForThread(threadId).get(handle) ?? personaNameFor(handle, threadId);
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
      viewer.selfVisibility ?? "public",
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
