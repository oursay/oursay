import type {
  CommentNode,
  FeedFilterParams,
  RecordDetail,
  ViewerContext,
} from "@/lib/types";
import { passesSignedFilter } from "@/lib/types/sign-tier";
import { geographyKeep } from "./geography";

/**
 * Whether a comment node survives the Post-page filter stack (Verified ladder,
 * geography, and passkey-signed-only). Same subtree-pruning as filterComments —
 * no reply-promotion.
 */
export function commentKeep(
  node: CommentNode,
  openPost: RecordDetail,
  viewer: ViewerContext,
  filter: FeedFilterParams,
): boolean {
  const tierMin = filter.tierMin ?? 0;
  if (node.tier < tierMin) return false;
  const signMin = filter.signedFilter ?? 0;
  if (signMin > 0 && !passesSignedFilter(node.signTier, signMin)) return false;
  return geographyKeep(
    node,
    openPost.districts,
    viewer,
    filter,
    openPost,
  );
}
