import type {
  CommentNode,
  FeedFilterParams,
  RecordDetail,
  ViewerContext,
} from "@/lib/types";
import { passesSignedFilter } from "@/lib/types/sign-tier";
import { geographyKeep, pinnedTierMin, resolveGeography } from "./geography";

/**
 * Whether a comment node survives the Post-page filter stack (Verified ladder,
 * geography, and passkey-signed-only). The refinements are computed here and
 * handed to geographyKeep so inclusive geography modes can broaden past them.
 * Same subtree-pruning as filterComments — no reply-promotion.
 */
export function commentKeep(
  node: CommentNode,
  openPost: RecordDetail,
  viewer: ViewerContext,
  filter: FeedFilterParams,
): boolean {
  const geo = resolveGeography(filter, viewer, openPost);
  const tierMin = pinnedTierMin(filter.tierMin ?? 0, geo);
  const signMin = filter.signedFilter ?? 0;
  const passesRefine =
    node.tier >= tierMin &&
    (signMin === 0 || passesSignedFilter(node.signTier, signMin));
  return geographyKeep(
    node,
    openPost.districts,
    viewer,
    filter,
    passesRefine,
    openPost,
  );
}
