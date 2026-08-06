import type { AuthorIdentity, PlatformRole } from "./identity";
import type { MentionsMap } from "./mentions";
import type { SignTier } from "./sign-tier";
import type { AuthorGeoRelation, VerificationTier } from "./verification";

/** Comment thread nesting is capped at depth 3 (docs/entities/civic-content/comment.md). */
export const COMMENT_MAX_DEPTH = 3;

/**
 * A comment node in a record's thread. Nested via `replies` up to
 * COMMENT_MAX_DEPTH; the wireframe flattens replies past that depth with an
 * `@handle` convention (a UI concern handled at render time).
 */
export interface CommentNode {
  /** Comment entity id (live API); absent on mock corpus rows. */
  id?: string;
  author: string;
  handle: string;
  tier: VerificationTier;
  /**
   * Official role in the thread's jurisdiction (role flag, not a KYC tier).
   * May later widen to seat-/jurisdiction-scoped lists without changing mark type.
   */
  official?: boolean;
  /**
   * Platform-scoped role mark (`admin` today). Mapped from wire `platformRoles`.
   */
  platformRole?: PlatformRole | null;
  /** Derived Media mark (≥1 valid accreditation). */
  mediaMark?: boolean;
  /** Media-accredited in the parent thread's jurisdiction. */
  mediaAccredited?: boolean;
  /**
   * Author's riding slug(s) — SERVER-INTERNAL (mock corpus + read-model
   * filtering only). A member's district is never shared with other members;
   * the API strips this and serves the `authorGeo` relation instead.
   */
  districts?: string[];
  /**
   * Server-resolved spatial relation to the viewer + open post — the only
   * residence signal that leaves the API. Present on API-served copies only.
   */
  authorGeo?: AuthorGeoRelation;
  /** ISO created time -> relTime(). */
  ts: string;
  /**
   * True when this comment's create commitment is covered by an external public-witness
   * anchor. Absent on mock corpus → treat as false.
   */
  externallyAnchored?: boolean;
  /** Revision count -> "N edits" affordance; absent/0 means never revised. */
  edits?: number;
  /** Action signing tier for this comment — see FeedItem.signTier. */
  signTier?: SignTier;
  body: string[];
  up: number;
  down: number;
  /** Viewer's own reaction on this comment. */
  _my?: "up" | "down" | null;
  /** Viewer-resolved author identity; present on API-served copies only. */
  identity?: AuthorIdentity;
  /** Opaque mention tokens → server display; absent when body has no tokens. */
  mentions?: MentionsMap;
  replies: CommentNode[];
}
