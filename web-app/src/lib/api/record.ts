import { POST_TYPES, type PostTypeEntry } from "@/lib/mock";
import { commentKeep } from "@/lib/read-model";
import {
  ANON_VIEWER,
  type CommentNode,
  type FeedFilterParams,
  type RecordDetail,
  type RecordKind,
  type ViewerContext,
} from "@/lib/types";

/** getRecordDetail return shape: the record plus its (filtered) comment thread. */
export interface RecordDetailResult {
  detail: RecordDetail;
  comments: CommentNode[];
}

/** Optional viewer/filter context for comment-thread filtering. */
export interface GetRecordDetailOptions {
  viewer?: ViewerContext;
  filter?: FeedFilterParams;
}

/** id -> representative detail sample, built once from POST_TYPES. */
const DETAIL_BY_ID: Record<string, PostTypeEntry> = Object.fromEntries(
  Object.values(POST_TYPES).map((entry) => [entry.post.id, entry]),
);

/**
 * Keep a comment subtree that passes commentKeep at each node.
 */
function filterComments(
  nodes: CommentNode[],
  detail: RecordDetail,
  viewer: ViewerContext,
  filter: FeedFilterParams,
): CommentNode[] {
  const kept: CommentNode[] = [];
  for (const node of nodes) {
    if (!commentKeep(node, detail, viewer, filter)) continue;
    kept.push({
      ...node,
      replies: filterComments(node.replies, detail, viewer, filter),
    });
  }
  return kept;
}

/**
 * A record's detail page + comment thread. Resolves `id` to a POST_TYPES sample
 * when possible, else falls back to the representative sample for `kind` (the
 * wireframe's representative-target navigation).
 *
 * When `opts.filter` / `opts.viewer` are supplied, comments are filtered by the
 * Verified ladder, geography (My Districts / Affected), and passkey-signed-only.
 */
export async function getRecordDetail(
  id: string,
  kind: RecordKind,
  opts: GetRecordDetailOptions = {},
): Promise<RecordDetailResult> {
  const entry = DETAIL_BY_ID[id] ?? POST_TYPES[kind];
  const viewer = opts.viewer ?? ANON_VIEWER;

  const comments = opts.filter
    ? filterComments(entry.comments, entry.post, viewer, opts.filter)
    : entry.comments;

  return { detail: entry.post, comments };
}
