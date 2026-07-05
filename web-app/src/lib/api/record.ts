import { DETAIL_BY_ID } from "@/lib/mock";
import { commentKeep } from "@/lib/read-model";
import {
  ANON_VIEWER,
  type CommentNode,
  type FeedFilterParams,
  type RecordDetail,
  type ViewerContext,
} from "@/lib/types";
import type { PostTypeEntry } from "@/lib/mock";
import { withPostJurisdictionDistricts } from "./geo-scope";
import { anonymizeRecordEntry } from "./identity";

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
 * A record's detail page + comment thread, resolved by stable mock record id.
 */
export async function getRecordDetail(
  id: string,
  opts: GetRecordDetailOptions = {},
): Promise<RecordDetailResult | null> {
  const entry: PostTypeEntry | undefined = DETAIL_BY_ID[id];
  if (!entry) return null;

  const viewer = opts.viewer ?? ANON_VIEWER;
  // The My Jurisdiction universe for comment filtering is the POST's own
  // jurisdiction, resolved server-side (the client never sends it).
  const comments = opts.filter
    ? filterComments(
        entry.comments,
        entry.post,
        viewer,
        withPostJurisdictionDistricts(opts.filter, entry.post.jurisdiction),
      )
    : entry.comments;

  // Author-identity enforcement: real handles never leave the API layer for
  // authors whose visibility excludes this viewer (docs/09).
  return anonymizeRecordEntry(entry.post, comments, viewer);
}

/** All mock record ids (feed + profile-only + graduation chain). */
export async function listRecordIds(): Promise<string[]> {
  return Object.keys(DETAIL_BY_ID);
}
