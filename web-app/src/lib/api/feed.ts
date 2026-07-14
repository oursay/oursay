import { POSTS } from "@/lib/mock";
import { matches } from "@/lib/read-model";
import {
  ANON_VIEWER,
  type FeedFilterParams,
  type FeedItem,
  type FeedScope,
  type ViewerContext,
} from "@/lib/types";
import { apiGet, buildQuery, isMockOnly } from "./client";
import { withScopeJurisdictionDistricts } from "./geo-scope";
import { anonymizeFeedItem } from "./identity";
import { getJurisdictionMembership } from "./membership";
import { kindToWireType, mapFeedItem } from "./map";
import { PAGE_SIZE, sliceLocalPage, type CursorPage } from "./pagination";

/** Inputs for a list query. All optional so callers can start from defaults. */
export interface ListFeedParams {
  /** List scope; defaults to "feed" (the unified cross-jurisdiction feed). */
  scope?: FeedScope;
  /** Filter matrix. Feed scope seeds `jurisdictions` from membership if omitted. */
  filter?: FeedFilterParams;
  /** Viewer context; defaults to a logged-out anon reader. */
  viewer?: ViewerContext;
  /** Opaque cursor from a prior page's `nextCursor`. */
  cursor?: string | null;
  /** Page size; defaults to {@link PAGE_SIZE}. */
  limit?: number;
}

async function resolveFeedFilter(
  params: ListFeedParams,
): Promise<{ scope: FeedScope; viewer: ViewerContext; filter: FeedFilterParams }> {
  const scope = params.scope ?? "feed";
  const viewer = params.viewer ?? ANON_VIEWER;
  let filter: FeedFilterParams = { ...params.filter };

  if (scope === "feed" && !filter.jurisdictions) {
    filter.jurisdictions = await getJurisdictionMembership();
  }

  filter = withScopeJurisdictionDistricts(filter, scope);
  return { scope, viewer, filter };
}

/** Wire query filters for live `/v1/public/feed` — scope pins jurisdiction/district. */
function liveFeedQueryParts(
  scope: FeedScope,
  filter: FeedFilterParams,
): {
  jurisdictions?: string[];
  districts?: string[];
  types?: string[];
  tierMin?: number;
  signedMin?: number;
} {
  const types = filter.types?.map(kindToWireType);
  const tierMin = filter.tierMin;
  const signedMin = filter.signedFilter;

  if (scope === "jurisdiction" && filter.jurisdiction) {
    return {
      jurisdictions: [filter.jurisdiction],
      types,
      tierMin,
      signedMin,
    };
  }
  if (scope === "district" && filter.districtSlug) {
    return {
      districts: [filter.districtSlug],
      types,
      tierMin,
      signedMin,
    };
  }

  const jurisdictions = filter.jurisdictions
    ?.filter((j) => j.included)
    .map((j) => j.id);
  return { jurisdictions, types, tierMin, signedMin };
}

async function listFeedItemsMock(params: ListFeedParams): Promise<CursorPage<FeedItem>> {
  const { scope, viewer, filter } = await resolveFeedFilter(params);
  const limit = params.limit ?? PAGE_SIZE;
  const all = POSTS.filter((item) => matches(item, scope, viewer, filter)).map(
    (item) => anonymizeFeedItem(item, viewer),
  );
  return sliceLocalPage(all, params.cursor, limit);
}

async function listFeedItemsLive(params: ListFeedParams): Promise<CursorPage<FeedItem>> {
  const { scope, viewer, filter } = await resolveFeedFilter(params);
  const limit = params.limit ?? PAGE_SIZE;
  const wire = liveFeedQueryParts(scope, filter);

  const kept: FeedItem[] = [];
  let apiCursor = params.cursor ?? undefined;
  let nextCursor: string | null = null;
  let total: number | undefined;

  // Client geography filters can thin a page; scan until we fill `limit`
  // matched rows or the API is exhausted. Prefer API `total` (filter-aligned).
  while (kept.length < limit) {
    const qs = buildQuery({
      jurisdictions: wire.jurisdictions,
      districts: wire.districts,
      types: wire.types,
      tierMin: wire.tierMin,
      signedMin: wire.signedMin,
      cursor: apiCursor,
      limit,
    });

    const res = await apiGet<{
      items: Record<string, unknown>[];
      nextCursor: string | null;
      total: number;
    }>(`/v1/public/feed${qs}`);
    if (!res?.items.length) {
      nextCursor = null;
      if (typeof res?.total === "number") total = res.total;
      break;
    }

    if (typeof res.total === "number") total = res.total;

    for (const raw of res.items) {
      // Live feed items already carry server-resolved identity (incl. iconType).
      const item = mapFeedItem(raw);
      if (!matches(item, scope, viewer, filter)) continue;
      kept.push(item);
    }

    nextCursor = res.nextCursor;
    if (!res.nextCursor) break;
    apiCursor = res.nextCursor;
  }

  return {
    items: kept.slice(0, limit),
    nextCursor: kept.length < limit ? null : nextCursor,
    total,
  };
}

/**
 * The unified feed / jurisdiction / district list. Applies the read-model
 * `matches` filter and returns a cursor page of records (with optional total).
 */
export async function listFeedItems(
  params: ListFeedParams = {},
): Promise<CursorPage<FeedItem>> {
  if (isMockOnly()) return listFeedItemsMock(params);
  return listFeedItemsLive(params);
}

/** Fetch every page (tests and callers that need the full filtered corpus). */
export async function listAllFeedItems(params: ListFeedParams = {}): Promise<FeedItem[]> {
  const all: FeedItem[] = [];
  let cursor: string | null = null;
  do {
    const page = await listFeedItems({ ...params, cursor });
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}
