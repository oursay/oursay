import { POSTS } from "@/lib/mock";
import { matches } from "@/lib/read-model";
import {
  ANON_VIEWER,
  type FeedFilterParams,
  type FeedItem,
  type FeedScope,
  type ViewerContext,
} from "@/lib/types";
import { withScopeJurisdictionDistricts } from "./geo-scope";
import { anonymizeFeedItem } from "./identity";
import { getJurisdictionMembership } from "./membership";

/** Inputs for a list query. All optional so callers can start from defaults. */
export interface ListFeedParams {
  /** List scope; defaults to "feed" (the unified cross-jurisdiction feed). */
  scope?: FeedScope;
  /** Filter matrix. Feed scope seeds `jurisdictions` from membership if omitted. */
  filter?: FeedFilterParams;
  /** Viewer context; defaults to a logged-out anon reader. */
  viewer?: ViewerContext;
}

/**
 * The unified feed / jurisdiction / district list. Applies the read-model
 * `matches` filter and returns the raw record counts.
 *
 * Count scaling is a single display-layer concern (wireframe §4.3): the card
 * components thin social reactions via `scaleSocial` and surface the additive
 * unverified-civic note via `civicExtra`, both keyed off the active Verified
 * tier. The comment-count pill always shows the record's true total. Keeping
 * scaling out of the API means raw server counts flow through unchanged once
 * this swaps to `fetch('/v1/public/...')` (see CONTRACT.md).
 */
export async function listFeedItems(
  params: ListFeedParams = {},
): Promise<FeedItem[]> {
  const scope = params.scope ?? "feed";
  const viewer = params.viewer ?? ANON_VIEWER;
  let filter: FeedFilterParams = { ...params.filter };

  // Feed scope filters by subscribed + included jurisdictions (cookie-shaped).
  if (scope === "feed" && !filter.jurisdictions) {
    filter.jurisdictions = await getJurisdictionMembership();
  }

  // The My Jurisdiction district universe is resolved HERE, per scope — the
  // client never sends it (see geo-scope.ts).
  filter = withScopeJurisdictionDistricts(filter, scope);

  return POSTS.filter((item) => matches(item, scope, viewer, filter)).map(
    (item) => anonymizeFeedItem(item, viewer),
  );
}
