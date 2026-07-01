import type { FeedFilterParams, ViewerContext } from "@/lib/types";
import type { AppState } from "./types";

/** The read-model viewer derived from session state (logged-out reads as anon). */
export function viewerFromState(state: AppState): ViewerContext {
  return {
    loggedIn: state.loggedIn,
    kycTier: state.kycTier,
    viewerDistricts: state.viewerDistricts,
  };
}

/**
 * Build the read-model filter from state. Views add `jurisdiction` /
 * `districtSlug` for their scope; feed scope uses the subscription list.
 */
export function feedFilterFromState(state: AppState): FeedFilterParams {
  return {
    jurisdictions: state.subscriptions,
    types: state.includedKinds,
    tierMin: state.verified,
    geography: { myDistricts: state.myDistricts, affected: state.affected },
  };
}
