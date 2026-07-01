import { PROFILE } from "@/lib/mock";
import type {
  ActivityItem,
  MentionItem,
  ProfilePost,
  PublicProfile,
} from "@/lib/types";

/**
 * A public profile. The mock ships one representative profile (the MLA Rae
 * Nguyen); any handle/id returns it (the wireframe's representative-target nav).
 */
export async function getProfile(
  handleOrId: string,
): Promise<PublicProfile> {
  void handleOrId;
  return PROFILE;
}

/** The profile's authored root records (Posts tab). */
export async function listProfilePosts(
  handleOrId: string,
): Promise<ProfilePost[]> {
  void handleOrId;
  return PROFILE.posts;
}

/** The profile's public action feed (Activity tab). */
export async function listProfileActivity(
  handleOrId: string,
): Promise<ActivityItem[]> {
  void handleOrId;
  return PROFILE.activity;
}

/** Others referencing this profile (Mentions tab). */
export async function listProfileMentions(
  handleOrId: string,
): Promise<MentionItem[]> {
  void handleOrId;
  return PROFILE.mentions;
}
