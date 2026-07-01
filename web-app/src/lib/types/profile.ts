import type { FeedItem } from "./records";
import type { VerificationTier } from "./verification";

/** A headline stat on the profile (e.g. "18 Statements"). */
export interface ProfileStat {
  n: number;
  label: string;
}

/** Kind axis for the Profile page's own record-type filter (distinct from the feed set). */
export type ActivityKind =
  | "statement"
  | "comment"
  | "petition"
  | "poll"
  | "reaction";

/**
 * A row in the profile Activity tab. Every public action (posts, comments,
 * edits, reactions, votes) is first-class here; `kind` drives the profile-type
 * filter and `icon` optionally overrides the kind's default glyph (e.g. an edit
 * uses the pencil but still filters under its content type).
 */
export interface ActivityItem {
  kind: ActivityKind;
  /** Optional glyph id override (e.g. "#ic-edit"). */
  icon?: string;
  text: string;
  meta: string;
}

/** A row in the profile Mentions tab (others referencing @handle). */
export interface MentionItem {
  author: string;
  handle: string;
  text: string;
  meta: string;
}

/**
 * A profile's authored root record. FeedItem-shaped so the same card renderer
 * can display it. No Results (a Result is a system outcome, not a user post).
 */
export type ProfilePost = FeedItem;

/** Public profile for the Profile view (the wireframe's PROFILE). */
export interface PublicProfile {
  name: string;
  handle: string;
  /** Role line, e.g. "MLA · Edmonton-Strathcona". */
  role: string;
  tier: VerificationTier;
  stats: ProfileStat[];
  posts: ProfilePost[];
  activity: ActivityItem[];
  mentions: MentionItem[];
}
