import { getProfileByHandle, person, personDistricts } from "@/lib/mock";
import { isRevealed } from "@/lib/read-model";
import {
  ANON_VIEWER,
  type ActivityItem,
  type MentionItem,
  type ProfilePost,
  type PublicProfile,
  type ViewerContext,
} from "@/lib/types";
import { apiGet, isMockOnly } from "./client";
import { anonymizeFeedItem, resolveAuthorIdentity } from "./identity";
import { mapActivityItem, mapFeedItem, mapProfileHeader } from "./map";

/** Optional viewer context; profiles are scope-checked against it. */
export interface GetProfileOptions {
  viewer?: ViewerContext;
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

async function fetchProfilePosts(handle: string): Promise<ProfilePost[]> {
  const res = await apiGet<{ items: Record<string, unknown>[] }>(
    `/v1/public/profiles/${encodeURIComponent(handle)}/posts?limit=100`,
  );
  return res?.items.map(mapFeedItem) ?? [];
}

async function fetchProfileActivity(handle: string): Promise<ActivityItem[]> {
  const res = await apiGet<{ items: Record<string, unknown>[] }>(
    `/v1/public/profiles/${encodeURIComponent(handle)}/activity?limit=100`,
  );
  return res?.items.map((row) => mapActivityItem(row)) ?? [];
}

async function getProfileLive(
  handleOrId: string,
  _opts: GetProfileOptions,
): Promise<PublicProfile | null> {
  const header = await apiGet<Record<string, unknown>>(
    `/v1/public/profiles/${encodeURIComponent(handleOrId)}`,
  );
  if (!header) return null;

  const [posts, activity] = await Promise.all([
    fetchProfilePosts(handleOrId),
    fetchProfileActivity(handleOrId),
  ]);

  return { ...mapProfileHeader(header), posts, activity, mentions: [] };
}

export async function getProfile(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<PublicProfile | null> {
  if (isMockOnly()) return getProfileMock(handleOrId, opts);
  return getProfileLive(handleOrId, opts);
}

export async function listProfilePosts(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<ProfilePost[]> {
  if (isMockOnly()) return (await getProfileMock(handleOrId, opts))?.posts ?? [];
  const header = await apiGet(`/v1/public/profiles/${encodeURIComponent(handleOrId)}`);
  if (!header) return [];
  return fetchProfilePosts(handleOrId);
}

export async function listProfileActivity(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<ActivityItem[]> {
  if (isMockOnly()) return (await getProfileMock(handleOrId, opts))?.activity ?? [];
  const header = await apiGet(`/v1/public/profiles/${encodeURIComponent(handleOrId)}`);
  if (!header) return [];
  return fetchProfileActivity(handleOrId);
}

export async function listProfileMentions(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<MentionItem[]> {
  if (isMockOnly()) return (await getProfileMock(handleOrId, opts))?.mentions ?? [];
  return [];
}
