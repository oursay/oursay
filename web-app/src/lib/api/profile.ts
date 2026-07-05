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
import { anonymizeFeedItem, resolveAuthorIdentity } from "./identity";

/** Optional viewer context; profiles are scope-checked against it. */
export interface GetProfileOptions {
  viewer?: ViewerContext;
}

function isSelf(handle: string, viewer: ViewerContext): boolean {
  return (
    !!viewer.selfHandle && handle.toLowerCase() === viewer.selfHandle.toLowerCase()
  );
}

/**
 * May this viewer see the profile behind `handle` at all? Out-of-scope
 * lookups resolve exactly like unknown handles (hide existence — docs/09 §3:
 * confirming a private account exists is itself a leak).
 */
function profileVisibleTo(handle: string, viewer: ViewerContext): boolean {
  if (isSelf(handle, viewer)) return true;
  return isRevealed(
    person(handle).visibility ?? "public",
    personDistricts(handle),
    viewer,
  );
}

/** Third-party mention authors resolve like any other author in their thread. */
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

export async function getProfile(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<PublicProfile | null> {
  const viewer = opts.viewer ?? ANON_VIEWER;
  const profile = getProfileByHandle(handleOrId);
  if (!profile || !profileVisibleTo(profile.handle, viewer)) return null;

  return {
    ...profile,
    // Owner's own posts (revealed by definition here) still run through the
    // anonymizer for uniformity; mention authors are third parties and mask.
    posts: profile.posts.map((p) => anonymizeFeedItem(p, viewer)),
    mentions: anonymizeMentions(profile.mentions, viewer),
  };
}

export async function listProfilePosts(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<ProfilePost[]> {
  return (await getProfile(handleOrId, opts))?.posts ?? [];
}

export async function listProfileActivity(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<ActivityItem[]> {
  return (await getProfile(handleOrId, opts))?.activity ?? [];
}

export async function listProfileMentions(
  handleOrId: string,
  opts: GetProfileOptions = {},
): Promise<MentionItem[]> {
  return (await getProfile(handleOrId, opts))?.mentions ?? [];
}
