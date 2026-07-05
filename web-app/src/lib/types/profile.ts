import type { AuthorIdentity } from "./identity";
import type { FeedItem } from "./records";
import type { VerificationTier } from "./verification";

/**
 * Aggregate civic response for a profile — totals across all of the member's
 * public Statements and Comments. Drives the profile support bar (agree/disagree
 * proportion) and its informational count pill (statements/comments totals).
 */
export interface ProfileSupport {
  /** Total agrees (up reactions) across public statements and comments. */
  agrees: number;
  /** Total disagrees (down reactions) across public statements and comments. */
  disagrees: number;
  /** Number of public statements authored (feather glyph). */
  statements: number;
  /** Number of public comments authored (comment glyph). */
  comments: number;
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
  /** Optional glyph id override (e.g. "#ic-edit", "#ic-check", "#ic-x", "#ic-check-alt"). */
  icon?: string;
  text: string;
  meta: string;
  /** Mock navigation target — the record this activity refers to. */
  recordId?: string;
}

/** A row in the profile Mentions tab (others referencing @handle). */
export interface MentionItem {
  author: string;
  handle: string;
  text: string;
  meta: string;
  /** Mock navigation target — the record this mention appears on. */
  recordId?: string;
  /** Viewer-resolved mention-author identity; present on API-served copies. */
  identity?: AuthorIdentity;
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
  /** Short freeform bio shown at the top of the profile. */
  bio: string;
  /** Rough account age for the support bar caption, e.g. "3 years", "7 months". */
  ageLabel: string;
  /** Aggregate agree/disagree + content totals for the support bar. */
  support: ProfileSupport;
  posts: ProfilePost[];
  activity: ActivityItem[];
  mentions: MentionItem[];
}
