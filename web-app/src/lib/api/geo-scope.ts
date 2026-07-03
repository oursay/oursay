import { DISTRICT_BY_SLUG, JUR_DATA } from "@/lib/mock";
import type { FeedFilterParams, FeedScope } from "@/lib/types";

/**
 * Server-side resolution of `geography.jurisdictionDistricts` — the district
 * universe the My Jurisdiction filter matches author residences against.
 *
 * The CLIENT never supplies it (jurisdiction geography config is the server's,
 * and the client must not need author districts to filter by them). Each read
 * path stamps it from its own scope before the read-model runs:
 * - feed:              union of the included subscribed jurisdictions
 * - jurisdiction view: that jurisdiction
 * - district view:     the district's parent jurisdiction
 * - post detail:       the post's jurisdiction (withPostJurisdictionDistricts)
 *
 * `undefined` (a district-less jurisdiction in scope, e.g. Global) gates the
 * filter off — it would exactly mirror Verified: Residency there.
 */

/** Every riding slug of a jurisdiction ([] for district-less ones, e.g. Global). */
export function jurisdictionSlugs(jurisdiction: string): string[] {
  return (JUR_DATA[jurisdiction]?.districts ?? []).map((d) => d.slug);
}

/** Union of the named jurisdictions' slugs; undefined when any is district-less. */
function districtUniverse(names: string[]): string[] | undefined {
  if (names.length === 0) return undefined;
  const slugs: string[] = [];
  for (const name of names) {
    const ds = jurisdictionSlugs(name);
    if (ds.length === 0) return undefined;
    slugs.push(...ds);
  }
  return slugs;
}

/** Stamp the list-scope district universe onto a filter (see module doc). */
export function withScopeJurisdictionDistricts(
  filter: FeedFilterParams,
  scope: FeedScope,
): FeedFilterParams {
  if (!filter.geography) return filter;
  let names: string[];
  if (scope === "jurisdiction" && filter.jurisdiction) {
    names = [filter.jurisdiction];
  } else if (scope === "district" && filter.districtSlug) {
    const jur = DISTRICT_BY_SLUG[filter.districtSlug]?.jur;
    names = jur ? [jur] : [];
  } else {
    names = (filter.jurisdictions ?? [])
      .filter((s) => s.included)
      .map((s) => s.name);
  }
  return {
    ...filter,
    geography: {
      ...filter.geography,
      jurisdictionDistricts: districtUniverse(names),
    },
  };
}

/** Stamp an open post's own jurisdiction universe onto a filter (post detail). */
export function withPostJurisdictionDistricts(
  filter: FeedFilterParams,
  jurisdiction: string,
): FeedFilterParams {
  if (!filter.geography) return filter;
  return {
    ...filter,
    geography: {
      ...filter.geography,
      jurisdictionDistricts: districtUniverse([jurisdiction]),
    },
  };
}
