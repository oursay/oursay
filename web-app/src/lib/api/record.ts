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
import { apiGet, isMockOnly } from "./client";
import { withPostJurisdictionDistricts } from "./geo-scope";
import { anonymizeRecordEntry } from "./identity";
import { mapCommentNode, mapRecordDetail } from "./map";

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

async function getRecordDetailMock(
  id: string,
  opts: GetRecordDetailOptions,
): Promise<RecordDetailResult | null> {
  const entry: PostTypeEntry | undefined = DETAIL_BY_ID[id];
  if (!entry) return null;

  const viewer = opts.viewer ?? ANON_VIEWER;
  const comments = opts.filter
    ? filterComments(
        entry.comments,
        entry.post,
        viewer,
        withPostJurisdictionDistricts(opts.filter, entry.post.jurisdiction),
      )
    : entry.comments;

  return anonymizeRecordEntry(entry.post, comments, viewer);
}

async function getRecordDetailLive(
  id: string,
  opts: GetRecordDetailOptions,
): Promise<RecordDetailResult | null> {
  const viewer = opts.viewer ?? ANON_VIEWER;
  const res = await apiGet<{
    detail: Record<string, unknown>;
    comments: Record<string, unknown>[];
  }>(`/v1/public/records/${encodeURIComponent(id)}`);
  if (!res) return null;

  const detail = mapRecordDetail(res.detail);
  let comments = res.comments.map(mapCommentNode);

  if (opts.filter) {
    comments = filterComments(
      comments,
      detail,
      viewer,
      withPostJurisdictionDistricts(opts.filter, detail.jurisdiction),
    );
  }

  return { detail, comments };
}

/**
 * A record's detail page + comment thread, resolved by stable record id.
 */
export async function getRecordDetail(
  id: string,
  opts: GetRecordDetailOptions = {},
): Promise<RecordDetailResult | null> {
  if (isMockOnly()) return getRecordDetailMock(id, opts);
  return getRecordDetailLive(id, opts);
}

/** All mock record ids (feed + profile-only + graduation chain). */
export async function listRecordIds(): Promise<string[]> {
  if (isMockOnly()) return Object.keys(DETAIL_BY_ID);
  return [];
}
