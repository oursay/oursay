import {
  DETAIL_BY_ID,
  person,
  personDistricts,
  THREAD_VISIBILITY_OVERRIDES,
} from "@/lib/mock";
import { DEFAULT_USER_ICON_TYPE } from "@/lib/avatar";
import { wireHandle } from "@/lib/handle";
import { readThreadVisibilities } from "@/lib/state/cookies";
import { isMockOnly } from "./client";
import { jurisdictionSlugs } from "./geo-scope";
import type { PostTypeEntry } from "@/lib/mock";
import {
  authorGeoRelation,
  buildPersonaMap,
  isRevealed,
  personaNameFor,
  resolveVisibility,
} from "@/lib/read-model";
import type { AuthorGeoContext } from "@/lib/read-model";
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
 * link, avatar seed) is masked. The verification-tier pill and all tallies
 * stay — those are anonymized civic signals per docs/09 §1, not identity.
 *
 * RESIDENCE PRIVACY: a member's raw districts never leave this layer. Served
 * DTOs carry only the narrowest viewer-relative relation (`authorGeo`:
 * home > affected > jurisdiction > none, resolved against the record's own
 * geography); `districts` / `authorDistricts` on served copies are stripped.
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

/** The persona name out-of-scope viewers see in `threadId`. Mock: handle-seeded; live: prefer server hints. */
export function personaShownToOthers(
  handle: string,
  threadId: string,
  serverHint?: string | null,
): string {
  if (!isMockOnly() && serverHint) return serverHint;
  return personaFor(handle, threadId);
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
  if (
    viewer.selfHandle &&
    wireHandle(handle)?.toLowerCase() === viewer.selfHandle.toLowerCase()
  ) {
    // Demo cookie memory (thread anonymity picker) wins over static fixtures so
    // a reload after change rehydrates the same visibility the UI just set.
    const remembered = readThreadVisibilities()[threadId];
    const fixture = THREAD_VISIBILITY_OVERRIDES[threadId]?.[handle];
    const ownVisibility = resolveVisibility(
      viewer.selfVisibility ?? "anonymous",
      remembered ?? fixture,
    );
    return {
      display: displayName,
      handle: wireHandle(handle) ?? handle,
      isPersona: false,
      isSelf: true,
      seed: wireHandle(handle) ?? handle,
      iconType: DEFAULT_USER_ICON_TYPE,
      threadId,
      visibility: ownVisibility,
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
    const wire = wireHandle(handle) ?? handle;
    return {
      display: displayName,
      handle: wire,
      isPersona: false,
      isSelf: false,
      seed: wire,
      iconType: DEFAULT_USER_ICON_TYPE,
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
 * Project the viewer's current thread anonymity onto a self identity so glyphs
 * and persona hints update as soon as the picker changes (before/without reload).
 */
export function withSelfVisibility(
  identity: AuthorIdentity | undefined,
  visibility: AuthorVisibility,
): AuthorIdentity | undefined {
  if (!identity?.isSelf) return identity;
  const handle = identity.handle ?? identity.seed;
  return {
    ...identity,
    visibility,
    seenByOthersAs:
      visibility === "public"
        ? undefined
        : identity.seenByOthersAs ?? personaFor(handle, identity.threadId),
  };
}

/** Apply {@link withSelfVisibility} through a comment tree. */
export function withSelfVisibilityOnComments(
  nodes: CommentNode[],
  visibility: AuthorVisibility,
): CommentNode[] {
  return nodes.map((node) => ({
    ...node,
    identity: withSelfVisibility(node.identity, visibility),
    replies: withSelfVisibilityOnComments(node.replies, visibility),
  }));
}

/** The authorGeo resolution context for a record's own geography. */
function geoContextFor(
  record: { districts: string[]; jurisdiction: string },
  viewer: ViewerContext,
): AuthorGeoContext {
  return {
    postDistricts: record.districts,
    jurisdictionDistricts: jurisdictionSlugs(record.jurisdiction),
    viewerDistricts: viewer.viewerDistricts,
    viewerKycTier: viewer.kycTier,
  };
}

/**
 * Copy a feed/list item with its author surface anonymized for this viewer.
 * A card's thread is the record itself, so the card persona matches the
 * detail-page persona. The author's raw residence (`authorDistricts`) is
 * replaced by the server-resolved `authorGeo` relation.
 */
export function anonymizeFeedItem(item: FeedItem, viewer: ViewerContext): FeedItem {
  const identity = resolveAuthorIdentity(item.handle, item.author, item.id, viewer);
  return {
    ...item,
    author: identity.display,
    handle: identity.handle ?? identity.display,
    identity,
    authorGeo: authorGeoRelation(item.authorDistricts, geoContextFor(item, viewer)),
    authorDistricts: undefined,
  };
}

function anonymizeComments(
  nodes: CommentNode[],
  threadId: string,
  viewer: ViewerContext,
  geoCtx: AuthorGeoContext,
): CommentNode[] {
  return nodes.map((node) => {
    const identity = resolveAuthorIdentity(node.handle, node.author, threadId, viewer);
    return {
      ...node,
      author: identity.display,
      handle: identity.handle ?? identity.display,
      identity,
      authorGeo: authorGeoRelation(node.districts, geoCtx),
      districts: undefined,
      replies: anonymizeComments(node.replies, threadId, viewer, geoCtx),
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
  const geoCtx = geoContextFor(detail, viewer);
  return {
    detail: {
      ...detail,
      author: identity.display,
      handle: identity.handle ?? identity.display,
      identity,
      authorGeo: authorGeoRelation(detail.authorDistricts, geoCtx),
      authorDistricts: undefined,
    },
    comments: anonymizeComments(comments, detail.id, viewer, geoCtx),
  };
}
