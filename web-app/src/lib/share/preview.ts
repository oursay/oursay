import { getRecordDetail } from "@/lib/api/record";
import { isMockOnly, publicApiGet } from "@/lib/api/client";
import { mapCommentNode, mapRecordDetail } from "@/lib/api/map";
import type { ShareTarget } from "@/lib/state";
import type { CommentNode, FeedItem, RecordDetail } from "@/lib/types";
import { ANON_VIEWER } from "@/lib/types";
import { parseCommentShareKey, recordIdFromShareTarget, findCommentForSharePreview } from "@/lib/share";

export type SharePreviewRecord = {
  variant: "record";
  item: FeedItem;
  /** ISO created time — share cards show the hard calendar date. */
  ts: string;
};

export type SharePreviewComment = {
  variant: "comment";
  node: CommentNode;
  depth: number;
};

export type SharePreview = SharePreviewRecord | SharePreviewComment;

function countCommentNodes(nodes: CommentNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countCommentNodes(node.replies);
  }
  return total;
}

function recordDetailToFeedItem(
  detail: RecordDetail,
  commentCount: number,
): FeedItem {
  return {
    id: detail.id,
    kind: detail.kind,
    jurisdiction: detail.jurisdiction,
    tier: detail.tier,
    districts: detail.districts,
    author: detail.author,
    handle: detail.handle,
    title: detail.title,
    body: detail.body,
    up: detail.up,
    down: detail.down,
    sig: detail.sig,
    goal: detail.goal,
    options: detail.options,
    comments: commentCount,
    edits: detail.edits,
    signTier: detail.signTier,
    attachedPoll: detail.attachedPoll,
    identity: detail.identity,
    authorGeo: detail.authorGeo,
    ...(detail.mentions ? { mentions: detail.mentions } : {}),
  };
}

/** Build a share-card preview from a publicly projected detail + comments. */
export function buildSharePreview(
  target: ShareTarget,
  detail: RecordDetail,
  comments: CommentNode[],
): SharePreview | null {
  if (target.variant === "record") {
    return {
      variant: "record",
      item: recordDetailToFeedItem(detail, countCommentNodes(comments)),
      ts: detail.ts,
    };
  }

  const parsed = parseCommentShareKey(target.shareKey);
  if (!parsed) return null;

  const found = findCommentForSharePreview(comments, {
    commentId: target.commentId,
    handle: parsed.handle,
    ts: parsed.ts,
  });
  if (!found) return null;

  return {
    variant: "comment",
    node: found.node,
    depth: found.depth,
  };
}

async function getPublicSharePreviewMock(
  target: ShareTarget,
): Promise<SharePreview | null> {
  const recordId = recordIdFromShareTarget(target);
  const result = await getRecordDetail(recordId, { viewer: ANON_VIEWER });
  if (!result) return null;
  return buildSharePreview(target, result.detail, result.comments);
}

async function getPublicSharePreviewLive(
  target: ShareTarget,
): Promise<SharePreview | null> {
  const recordId = recordIdFromShareTarget(target);
  const res = await publicApiGet<{
    detail: Record<string, unknown>;
    comments: Record<string, unknown>[];
  }>(`/v1/public/records/${encodeURIComponent(recordId)}`);
  if (!res) return null;

  const detail = mapRecordDetail(res.detail);
  const comments = res.comments.map(mapCommentNode);
  return buildSharePreview(target, detail, comments);
}

/**
 * Load the anonymous public projection for a share preview card — the same
 * data an unauthenticated viewer would see on the feed, not the logged-in
 * viewer's privileged identity or `_my` state.
 */
export async function getPublicSharePreview(
  target: ShareTarget,
): Promise<SharePreview | null> {
  if (isMockOnly()) return getPublicSharePreviewMock(target);
  return getPublicSharePreviewLive(target);
}
