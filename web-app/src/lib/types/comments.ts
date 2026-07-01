import type { VerificationTier } from "./verification";

/** Comment thread nesting is capped at depth 3 (docs/entities/civic-content/comment.md). */
export const COMMENT_MAX_DEPTH = 3;

/**
 * A comment node in a record's thread. Nested via `replies` up to
 * COMMENT_MAX_DEPTH; the wireframe flattens replies past that depth with an
 * `@handle` convention (a UI concern handled at render time).
 */
export interface CommentNode {
  author: string;
  handle: string;
  tier: VerificationTier;
  /** Author's riding slug(s); drives the "in my district" home-author glyph. */
  districts?: string[];
  /** ISO created time -> relTime(). */
  ts: string;
  /** Revision count -> "N edits" affordance; absent/0 means never revised. */
  edits?: number;
  body: string[];
  up: number;
  down: number;
  /** Viewer's own reaction on this comment. */
  _my?: "up" | "down" | null;
  replies: CommentNode[];
}
