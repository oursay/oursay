import type { AuthorIdentity } from "./identity";
import type { SignTier } from "./sign-tier";
import type { AuthorGeoRelation, VerificationTier } from "./verification";

/**
 * Record kind, in the wireframe's product labels. The canonical record type for
 * a Statement is `post` (see docs/GLOSSARY.md); the other three share their name.
 */
export type RecordKind = "statement" | "petition" | "poll" | "result";

/** Canonical record type as stored/served by the API. */
export type CanonicalRecordType = "post" | "petition" | "poll" | "result";

/** Wireframe label -> canonical record type. */
export function toCanonical(kind: RecordKind): CanonicalRecordType {
  return kind === "statement" ? "post" : kind;
}

/** A single poll/result option with its official (residency-verified) tally. */
export interface RecordOption {
  label: string;
  /** Official vote count for this option. */
  v: number;
}

/**
 * A pre-attached poll on a petition. Graduates into a real poll once the
 * petition passes its signature threshold (petitionGraduated in the wireframe).
 */
export interface AttachedPoll {
  question: string;
  options: string[];
}

/**
 * Feed / list summary row. One shape renders every card across the Feed,
 * Jurisdiction, District, and Profile-posts lists (the wireframe's buildCard).
 * Metrics are per-kind: reactions on statements/results, sig/goal on petitions,
 * options on polls/results.
 */
export interface FeedItem {
  /** Stable synthetic id (the wireframe POSTS[] rows carry no id). */
  id: string;
  kind: RecordKind;
  /** Jurisdiction name, e.g. "Global" | "Alberta". */
  jurisdiction: string;
  tier: VerificationTier;
  /** District slugs: [] jurisdiction-wide, [slug] one riding, [slug,...] several. */
  districts: string[];
  /**
   * The AUTHOR's home riding slugs (their residence), distinct from `districts`
   * (the area the post affects) — SERVER-INTERNAL (mock corpus + read-model
   * filtering only). A member's district is never shared with other members;
   * the API strips this and serves the `authorGeo` relation instead.
   */
  authorDistricts?: string[];
  /**
   * Server-resolved spatial relation of the author to the viewer + this post —
   * the only residence signal that leaves the API. Present on API-served
   * copies only.
   */
  authorGeo?: AuthorGeoRelation;
  author: string;
  handle: string;
  title: string;
  body: string[];

  /** Reactions (statements/results). */
  up?: number;
  down?: number;
  /** Petition signature progress. */
  sig?: number;
  goal?: number;
  /** Poll / result option tallies. */
  options?: RecordOption[];

  /** Social comment count. */
  comments: number;
  /** Revision count -> "N edits" affordance; absent/0 means never revised. */
  edits?: number;
  /**
   * Action signing tier (parallel to author `tier` / KYC). ≥1 ⇒ Signed pill.
   * Independent of KYC tier. Absent ⇒ 0 (derived-key / no pill).
   */
  signTier?: SignTier;
  /** Petition's pre-attached poll, if any. */
  attachedPoll?: AttachedPoll;
  /** Viewer-resolved author identity; present on API-served copies only. */
  identity?: AuthorIdentity;
}

/**
 * Full record detail for the Post view. Extends the summary with the fields the
 * detail page renders: creation timestamp, viewer's own reaction/vote, and the
 * petition/poll/result interlink flags that drive the collapsible sections.
 */
export interface RecordDetail {
  id: string;
  kind: RecordKind;
  jurisdiction: string;
  tier: VerificationTier;
  districts: string[];
  /** Author's home riding slugs — SERVER-INTERNAL, see FeedItem.authorDistricts. */
  authorDistricts?: string[];
  /** Server-resolved author relation — see FeedItem.authorGeo. */
  authorGeo?: AuthorGeoRelation;
  author: string;
  handle: string;
  title: string;
  body: string[];
  /** ISO created time; rendered via relTime(). Display-only, not the ordering source. */
  ts: string;
  edits: number;
  /** Action signing tier — see FeedItem.signTier. */
  signTier?: SignTier;

  up?: number;
  down?: number;
  sig?: number;
  goal?: number;
  options?: RecordOption[];

  /** Viewer's own reaction on this record: "up" | "down" | null. */
  _my?: "up" | "down" | null;
  /** Viewer's own poll vote (option label) or null. */
  _vote?: string | null;

  /** Petition -> proposed/attached poll. */
  attachedPoll?: AttachedPoll;
  /** Poll/result: has a source petition -> "Source Petition" collapsible. */
  sourcePetition?: boolean;
  /** Result: has a source poll -> "Poll" collapsible. */
  sourcePoll?: boolean;
  /** Poll: a result has been published -> "Result" collapsible. */
  resultPublished?: boolean;
  /** Viewer-resolved author identity; present on API-served copies only. */
  identity?: AuthorIdentity;
}
