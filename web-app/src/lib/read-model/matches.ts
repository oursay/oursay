import type {
  FeedFilterParams,
  FeedItem,
  FeedScope,
  ViewerContext,
} from "@/lib/types";
import { passesSignedFilter } from "@/lib/types/sign-tier";
import {
  inMyDistricts,
  isJurisdictionKeep,
  isJurisdictionMatch,
  pinnedTierMin,
  resolveGeography,
} from "./geography";

/**
 * The one list matcher (wireframe matches(p, scope)), parameterized on the
 * viewer + filter instead of global state. Encodes the filter matrix once:
 *
 *   record-type include  (all scopes)   -> kind must be in filter.types
 *   Verified ladder      (all scopes)   -> tier >= filter.tierMin (inclusive-upward)
 *   Signed ladder        (all scopes)   -> signTier >= signedFilter (inclusive-upward)
 *   My Jurisdiction      (all scopes)   -> the AUTHOR's residence
 *                           (item.authorDistricts) against the scope's
 *                           jurisdiction districts
 *   feed                 -> a subscribed + included jurisdiction (+ My Districts)
 *   jurisdiction         -> item.jurisdiction === filter.jurisdiction (+ My Districts)
 *   district             -> item applies to filter.districtSlug (incl. multi-district)
 *
 * Geography composes by mode: inclusive ADDS matches past the Verified/Signed
 * refinements (broaden); exclusive ANDs on top of them (narrow). Note My
 * Districts matches the POST's districts (where it applies) while My
 * Jurisdiction matches the AUTHOR's (where they live). Signed is independent
 * of the Verified ladder and geography. Affected is NOT applied here — it is
 * a Post-page comment filter only.
 */
export function matches(
  item: FeedItem,
  scope: FeedScope,
  ctx: ViewerContext,
  filter: FeedFilterParams,
): boolean {
  // record-type include (undefined types => all kinds included)
  if (filter.types && !filter.types.includes(item.kind)) return false;

  // The tightening refinements: min author verification (pinned to Residency
  // while a geography exclusive is engaged) + min signing tier, both
  // inclusive-upward. Inclusive geography may keep an item past these.
  const geo = resolveGeography(filter, ctx);
  const tierMin = pinnedTierMin(filter.tierMin ?? 0, geo);
  const signMin = filter.signedFilter ?? 0;
  const passesRefine =
    item.tier >= tierMin &&
    (signMin === 0 || passesSignedFilter(item.signTier, signMin));

  const myMode = geo.myDistricts;
  const jurMode = geo.myJurisdiction;
  const jurDistricts = filter.geography?.jurisdictionDistricts ?? [];
  // My Jurisdiction reads the author's RESIDENCE, not the post's districts.
  const author = { districts: item.authorDistricts, tier: item.tier };

  if (scope === "feed") {
    if (filter.jurisdictions) {
      const sub = filter.jurisdictions.find((s) => s.name === item.jurisdiction);
      if (!sub || !sub.included) return false;
    }
    if (myMode === "inclusive" && inMyDistricts(item, ctx.viewerDistricts)) {
      return true;
    }
    if (jurMode === "inclusive" && isJurisdictionMatch(author, jurDistricts)) {
      return true;
    }
    if (!passesRefine) return false;
    if (
      myMode === "exclusive" &&
      item.jurisdiction !== "Global" &&
      !inMyDistricts(item, ctx.viewerDistricts)
    ) {
      return false;
    }
    if (jurMode === "exclusive" && !isJurisdictionKeep(author, jurDistricts)) {
      return false;
    }
    return true;
  }

  if (scope === "jurisdiction") {
    if (item.jurisdiction !== filter.jurisdiction) return false;
    if (myMode === "inclusive" && inMyDistricts(item, ctx.viewerDistricts)) {
      return true;
    }
    if (jurMode === "inclusive" && isJurisdictionMatch(author, jurDistricts)) {
      return true;
    }
    if (!passesRefine) return false;
    if (myMode === "exclusive" && !inMyDistricts(item, ctx.viewerDistricts)) {
      return false;
    }
    if (jurMode === "exclusive" && !isJurisdictionKeep(author, jurDistricts)) {
      return false;
    }
    return true;
  }

  if (scope === "district") {
    if (!filter.districtSlug || !item.districts.includes(filter.districtSlug)) {
      return false;
    }
    if (jurMode === "inclusive" && isJurisdictionMatch(author, jurDistricts)) {
      return true;
    }
    if (!passesRefine) return false;
    if (jurMode === "exclusive" && !isJurisdictionKeep(author, jurDistricts)) {
      return false;
    }
    return true;
  }

  return false;
}
