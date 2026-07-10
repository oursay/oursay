import type { CommentNode, FeedItem, RecordDetail, RecordKind } from "@/lib/types";
import type { ShareTarget } from "@/lib/state";
import { isMockOnly } from "@/lib/api/client";
import { postPath } from "@/lib/routes";

/** Small deterministic string hash — seeds a believable base share count. */
function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Seeded base share count for a record/comment (the tally before the viewer's
 * own share). **Demo-only:** there is no server share model yet (WEB-APP-GAPS
 * Part 2 `share_marks`), so this fabricates a believable, deterministic tally
 * from the share key in mock/demo mode. In live mode it returns 0 — the pill
 * then reflects only the viewer's own share rather than an invented number.
 */
export function shareBaseCount(key: string): number {
  if (!isMockOnly()) return 0;
  return 3 + (hashKey(key) % 480);
}

/**
 * Stable per-comment identity key (for share + reaction tallies).
 * Position-independent (handle + timestamp) so it survives filter reordering,
 * unlike the render-time node path.
 */
export function commentKey(
  recordId: string,
  node: Pick<CommentNode, "handle" | "ts">,
): string {
  return `${recordId}::c::${node.handle}::${node.ts}`;
}

/** Reaction / record-state lookup key for a comment (entity id when known). */
export function commentReactionKey(
  threadId: string,
  node: Pick<CommentNode, "id" | "handle" | "ts">,
): string {
  return node.id ?? commentKey(threadId, node);
}

/** Collect stable comment entity ids from a (possibly nested) comment list. */
export function collectCommentIds(nodes: CommentNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: CommentNode[]): void => {
    for (const node of list) {
      if (node.id) ids.push(node.id);
      walk(node.replies);
    }
  };
  walk(nodes);
  return ids;
}

/** Record id encoded in a comment share key (`recordId::c::handle::ts`). */
export function recordIdFromShareTarget(target: ShareTarget): string {
  if (target.variant === "record") return target.shareKey;
  const parsed = parseCommentShareKey(target.shareKey);
  return parsed?.recordId ?? target.shareKey.split("::c::")[0] ?? target.shareKey;
}

/** Parse the stable comment share key back into its parts. */
export function parseCommentShareKey(
  shareKey: string,
): { recordId: string; handle: string; ts: string } | null {
  const match = /^(.+)::c::([^:]+)::(.+)$/.exec(shareKey);
  if (!match) return null;
  return { recordId: match[1], handle: match[2], ts: match[3] };
}

/** Build a share target from a feed row or a full record detail. */
export function recordShareTarget(item: FeedItem | RecordDetail): ShareTarget {
  return {
    variant: "record",
    shareKey: item.id,
    path: postPath(item.kind, item.id),
    recordKind: item.kind,
    author: item.author,
    handle: item.handle,
    tier: item.tier,
    signTier: item.signTier,
    authorGeo: item.authorGeo,
    identity: item.identity,
    title: item.title,
    body: item.body,
  };
}

/** Build a share target for one comment within a record's thread. */
export function commentShareTarget(
  node: CommentNode,
  recordKind: RecordKind,
  recordId: string,
  timestamp: string,
  depth: number,
): ShareTarget {
  return {
    variant: "comment",
    shareKey: commentKey(recordId, node),
    path: postPath(recordKind, recordId, { comments: true }),
    author: node.author,
    handle: node.handle,
    tier: node.tier,
    signTier: node.signTier,
    authorGeo: node.authorGeo,
    identity: node.identity,
    body: node.body,
    timestamp,
    depth,
  };
}
