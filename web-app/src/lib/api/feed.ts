import { POSTS } from "@/lib/mock";
import {
  matches,
  scaleSocial,
} from "@/lib/read-model";
import {
  ANON_VIEWER,
  type FeedFilterParams,
  type FeedItem,
  type FeedScope,
  type VerificationTier,
  type ViewerContext,
} from "@/lib/types";
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

/** Thin a feed item's social counts (reactions + comments) for the Verified tier. */
function withScaledSocial(item: FeedItem, tierMin: VerificationTier): FeedItem {
  return {
    ...item,
    up: item.up === undefined ? undefined : scaleSocial(item.up, tierMin),
    down: item.down === undefined ? undefined : scaleSocial(item.down, tierMin),
    comments: scaleSocial(item.comments, tierMin),
  };
}

/**
 * The unified feed / jurisdiction / district list. Applies the read-model
 * `matches` filter, then thins social counts via `scaleSocial` (civic counts —
 * sig/goal/options — are left as the official total, per the read-model).
 *
 * Mock-backed today (reads the ported POSTS[]). The future HTTP shape and
 * per-type-vs-unified-feed decision are documented in CONTRACT.md.
 */
export async function listFeedItems(
  params: ListFeedParams = {},
): Promise<FeedItem[]> {
  const scope = params.scope ?? "feed";
  const viewer = params.viewer ?? ANON_VIEWER;
  const filter: FeedFilterParams = { ...params.filter };

  // Feed scope filters by subscribed + included jurisdictions (cookie-shaped).
  if (scope === "feed" && !filter.jurisdictions) {
    filter.jurisdictions = await getJurisdictionMembership();
  }

  const tierMin = filter.tierMin ?? 0;
  return POSTS.filter((item) => matches(item, scope, viewer, filter)).map(
    (item) => withScaledSocial(item, tierMin),
  );
}
