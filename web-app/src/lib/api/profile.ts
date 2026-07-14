import { getProfileByHandle, person, personDistricts } from "@/lib/mock";
import { isRevealed } from "@/lib/read-model";
import {
  ANON_VIEWER,
  type ActivityItem,
  type ActivityKind,
  type MentionItem,
  type ProfilePost,
  type PublicProfile,
  type ViewerContext,
} from "@/lib/types";
import { apiGet, buildQuery, isMockOnly } from "./client";
import { anonymizeFeedItem, resolveAuthorIdentity } from "./identity";
import { kindToWireType, mapActivityItem, mapFeedItem, mapMentionItem, mapProfileHeader } from "./map";
import { PAGE_SIZE, sliceLocalPage, type CursorPage } from "./pagination";

/** Optional viewer context; profiles are scope-checked against it. */
export interface GetProfileOptions {
  viewer?: ViewerContext;
}

export interface ListProfileTabParams extends GetProfileOptions {
  cursor?: string | null;
  limit?: number;
  /** Profile Activity-type filter (posts tab maps root kinds). */
  profileTypes?: ActivityKind[];
  /** Verified ladder floor for the posts tab. */
  tierMin?: number;
}

function isSelf(handle: string, viewer: ViewerContext): boolean {
  return (
    !!viewer.selfHandle && handle.toLowerCase() === viewer.selfHandle.toLowerCase()
  );
}

function profileVisibleTo(handle: string, viewer: ViewerContext): boolean {
  if (isSelf(handle, viewer)) return true;
  return isRevealed(
    person(handle).visibility ?? "public",
    personDistricts(handle),
    viewer,
  );
}

function anonymizeMentions(
  mentions: MentionItem[],
  viewer: ViewerContext,
): MentionItem[] {
  return mentions.map((m) => {
    const identity = resolveAuthorIdentity(
      m.handle,
      m.author,
      m.recordId ?? "mentions",
      viewer,
    );
    return {
      ...m,
      author: identity.display,
      handle: identity.handle ?? identity.display,
      identity,
    };
  });
}

function filterProfilePosts(
  posts: ProfilePost[],
  profileTypes?: ActivityKind[],
  tierMin?: number,
): ProfilePost[] {
  return posts.filter((p) => {
    if (profileTypes && !profileTypes.includes(p.kind as ActivityKind)) return false;
    if (tierMin != null && p.tier < tierMin) return false;
    return true;
  });
}

function filterProfileActivity(
  activity: ActivityItem[],
  profileTypes?: ActivityKind[],
): ActivityItem[] {
  if (!profileTypes) return activity;
  return activity.filter((a) => profileTypes.includes(a.kind));
}

async function getProfileMock(
  handleOrId: string,
  opts: GetProfileOptions,
): Promise<PublicProfile | null> {
  const viewer = opts.viewer ?? ANON_VIEWER;
  const profile = getProfileByHandle(handleOrId);
  if (!profile || !profileVisibleTo(profile.handle, viewer)) return null;

  return {
    ...profile,
    posts: profile.posts.map((p) => anonymizeFeedItem(p, viewer)),
    mentions: anonymizeMentions(profile.mentions, viewer),
  };
}

async function getProfileLive(
  handleOrId: string,
  _opts: GetProfileOptions,
): Promise<PublicProfile | null> {
  const header = await apiGet<Record<string, unknown>>(
    `/v1/public/profiles/${encodeURIComponent(handleOrId)}`,
  );
  if (!header) return null;

  return { ...mapProfileHeader(header), posts: [], activity: [], mentions: [] };
}

export async function getProfile(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<PublicProfile | null> {
  if (isMockOnly()) return getProfileMock(handleOrId, opts);
  return getProfileLive(handleOrId, opts);
}

async function listProfilePostsLive(
  handleOrId: string,
  opts: ListProfileTabParams,
): Promise<CursorPage<ProfilePost>> {
  const limit = opts.limit ?? PAGE_SIZE;
  const types = opts.profileTypes
    ?.filter((k) => k !== "comment" && k !== "reaction")
    .map(kindToWireType);

  const qs = buildQuery({
    types,
    cursor: opts.cursor ?? undefined,
    limit,
  });

  const res = await apiGet<{ items: Record<string, unknown>[]; nextCursor: string | null }>(
    `/v1/public/profiles/${encodeURIComponent(handleOrId)}/posts${qs}`,
  );
  if (!res) return { items: [], nextCursor: null };

  let items = res.items.map(mapFeedItem);
  if (opts.tierMin != null) {
    items = items.filter((p) => p.tier >= opts.tierMin!);
  }
  // Live identity (incl. iconType) is already resolved by the API — do not
  // re-run mock anonymize, which would replace iconType with the default.
  return { items, nextCursor: res.nextCursor };
}

async function listProfileActivityLive(
  handleOrId: string,
  opts: ListProfileTabParams,
): Promise<CursorPage<ActivityItem>> {
  const limit = opts.limit ?? PAGE_SIZE;
  const kinds = opts.profileTypes;

  const qs = buildQuery({
    kinds,
    cursor: opts.cursor ?? undefined,
    limit,
  });

  const res = await apiGet<{ items: Record<string, unknown>[]; nextCursor: string | null }>(
    `/v1/public/profiles/${encodeURIComponent(handleOrId)}/activity${qs}`,
  );
  if (!res) return { items: [], nextCursor: null };

  return {
    items: res.items.map((row) => mapActivityItem(row)),
    nextCursor: res.nextCursor,
  };
}

async function listProfileMentionsLive(
  handleOrId: string,
  opts: ListProfileTabParams,
): Promise<CursorPage<MentionItem>> {
  const limit = opts.limit ?? PAGE_SIZE;

  const qs = buildQuery({
    cursor: opts.cursor ?? undefined,
    limit,
  });

  const res = await apiGet<{ items: Record<string, unknown>[]; nextCursor: string | null }>(
    `/v1/public/profiles/${encodeURIComponent(handleOrId)}/mentions${qs}`,
  );
  if (!res) return { items: [], nextCursor: null };

  // Server already resolved mentioner identity (incl. iconType).
  return {
    items: res.items.map((row) => mapMentionItem(row)),
    nextCursor: res.nextCursor,
  };
}

export async function listProfilePosts(
  handleOrId: string,
  opts: ListProfileTabParams = {},
): Promise<CursorPage<ProfilePost>> {
  if (isMockOnly()) {
    const profile = await getProfileMock(handleOrId, opts);
    if (!profile) return { items: [], nextCursor: null };
    const filtered = filterProfilePosts(profile.posts, opts.profileTypes, opts.tierMin);
    return sliceLocalPage(filtered, opts.cursor, opts.limit ?? PAGE_SIZE);
  }
  return listProfilePostsLive(handleOrId, opts);
}

export async function listProfileActivity(
  handleOrId: string,
  opts: ListProfileTabParams = {},
): Promise<CursorPage<ActivityItem>> {
  if (isMockOnly()) {
    const profile = await getProfileMock(handleOrId, opts);
    if (!profile) return { items: [], nextCursor: null };
    const filtered = filterProfileActivity(profile.activity, opts.profileTypes);
    return sliceLocalPage(filtered, opts.cursor, opts.limit ?? PAGE_SIZE);
  }
  return listProfileActivityLive(handleOrId, opts);
}

export async function listProfileMentions(
  handleOrId: string,
  opts: ListProfileTabParams = {},
): Promise<CursorPage<MentionItem>> {
  if (isMockOnly()) {
    const profile = await getProfileMock(handleOrId, opts);
    if (!profile) return { items: [], nextCursor: null };
    return sliceLocalPage(profile.mentions, opts.cursor, opts.limit ?? PAGE_SIZE);
  }
  return listProfileMentionsLive(handleOrId, opts);
}

/** Fetch every page for a profile tab (tests). */
export async function listAllProfilePosts(
  handleOrId: string,
  opts: ListProfileTabParams = {},
): Promise<ProfilePost[]> {
  const all: ProfilePost[] = [];
  let cursor: string | null = null;
  do {
    const page = await listProfilePosts(handleOrId, { ...opts, cursor });
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}
