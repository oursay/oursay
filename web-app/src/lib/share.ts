import type { CommentNode, FeedItem, RecordDetail, RecordKind } from "@/lib/types";
import type { ShareTarget } from "@/lib/state";
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
 * own share). Deterministic from the share key, so the pill reads the same in
 * every list and on the detail page.
 */
export function shareBaseCount(key: string): number {
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
