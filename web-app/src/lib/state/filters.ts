import { MY_HANDLE } from "@/lib/mock/constants";
import { JUR_DATA } from "@/lib/mock";
import type { FeedFilterParams, SignedFilterLevel, ViewerContext } from "@/lib/types";
import { clampSignedFilterLevel } from "@/lib/types/sign-tier";
import type { AppState } from "./types";

/** The read-model viewer derived from session state (logged-out reads as anon). */
export function viewerFromState(state: AppState): ViewerContext {
  return {
    loggedIn: state.loggedIn,
    kycTier: state.kycTier,
    viewerDistricts: state.viewerDistricts,
    selfHandle: state.loggedIn ? MY_HANDLE : undefined,
    selfVisibility: state.accountVisibility,
  };
}

/**
 * Build the read-model filter from state. Views add `jurisdiction` /
 * `districtSlug` for their scope; feed scope uses the subscription list.
 *
 * Deliberately does NOT resolve `geography.jurisdictionDistricts`: the API
 * layer stamps that per scope (see lib/api/geo-scope.ts) — the client never
 * sends the district universe. Keeping it out also keeps this filter
 * independent of `pageJurisdiction`, which views SET while fetching with this
 * filter; depending on it caused a refetch/flicker loop on the Post view.
 */
export function feedFilterFromState(state: AppState): FeedFilterParams {
  return {
    jurisdictions: state.subscriptions,
    types: state.includedKinds,
    tierMin: state.verified,
    geography: {
      myDistricts: state.myDistricts,
      affected: state.affected,
      myJurisdiction: state.myJurisdiction,
      priority: state.geoPriority,
    },
    signedFilter: clampSignedFilterLevel(state.signedFilter),
  };
}

/**
 * District-slug universe for the ACTIVE VIEW's scope: an open jurisdiction /
 * district / post view (pageJurisdiction) pins its own jurisdiction; the
 * unified feed unions the included subscriptions. undefined when a
 * district-less jurisdiction (e.g. Global) is in scope — the My Jurisdiction
 * filter gates off there (it would mirror Verified: Residency).
 */
function jurisdictionDistrictsFromState(state: AppState): string[] | undefined {
  const names = state.pageJurisdiction
    ? [state.pageJurisdiction]
    : state.subscriptions.filter((s) => s.included).map((s) => s.name);
  if (names.length === 0) return undefined;
  const slugs: string[] = [];
  for (const name of names) {
    const districts = JUR_DATA[name]?.districts ?? [];
    if (districts.length === 0) return undefined;
    for (const d of districts) slugs.push(d.slug);
  }
  return slugs;
}

/**
 * feedFilterFromState plus the active view's district universe — for CHROME
 * ONLY (filter-row gating, implied display modes, the effective Verified pin,
 * cycle handlers). Never hand this to a fetch effect: it reads
 * `pageJurisdiction`, which the open view writes after loading.
 */
export function scopedFeedFilterFromState(state: AppState): FeedFilterParams {
  const filter = feedFilterFromState(state);
  return {
    ...filter,
    geography: {
      ...filter.geography!,
      jurisdictionDistricts: jurisdictionDistrictsFromState(state),
    },
  };
}
