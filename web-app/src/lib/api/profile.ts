import { getProfileByHandle } from "@/lib/mock";
import type {
  ActivityItem,
  MentionItem,
  ProfilePost,
  PublicProfile,
} from "@/lib/types";

export async function getProfile(
  handleOrId: string,
): Promise<PublicProfile | null> {
  return getProfileByHandle(handleOrId) ?? null;
}

export async function listProfilePosts(
  handleOrId: string,
): Promise<ProfilePost[]> {
  return getProfileByHandle(handleOrId)?.posts ?? [];
}

export async function listProfileActivity(
  handleOrId: string,
): Promise<ActivityItem[]> {
  return getProfileByHandle(handleOrId)?.activity ?? [];
}

export async function listProfileMentions(
  handleOrId: string,
): Promise<MentionItem[]> {
  return getProfileByHandle(handleOrId)?.mentions ?? [];
}
