import type {
  FeedFilterParams,
  FeedItem,
  FeedScope,
  ViewerContext,
} from "@/lib/types";
import { effectiveMyDistricts, inMyDistricts } from "./geography";

/**
 * The one list matcher (wireframe matches(p, scope)), parameterized on the
 * viewer + filter instead of global state. Encodes the filter matrix once:
 *
 *   record-type include  (all scopes)   -> kind must be in filter.types
 *   Verified ladder      (all scopes)   -> tier >= filter.tierMin (inclusive-upward)
 *   feed                 -> a subscribed + included jurisdiction (+ My Districts)
 *   jurisdiction         -> item.jurisdiction === filter.jurisdiction (+ My Districts)
 *   district             -> item applies to filter.districtSlug (incl. multi-district)
 *
 * Affected is NOT applied here — it is a Post-page comment filter only.
 */
export function matches(
  item: FeedItem,
  scope: FeedScope,
  ctx: ViewerContext,
  filter: FeedFilterParams,
): boolean {
  // record-type include (undefined types => all kinds included)
  if (filter.types && !filter.types.includes(item.kind)) return false;

  // min author verification, inclusive-upward
  const tierMin = filter.tierMin ?? 0;
  if (item.tier < tierMin) return false;

  if (scope === "feed") {
    if (filter.jurisdictions) {
      const sub = filter.jurisdictions.find((s) => s.name === item.jurisdiction);
      if (!sub || !sub.included) return false;
    }
    if (
      effectiveMyDistricts(filter, ctx, tierMin) &&
      item.jurisdiction !== "Global" &&
      !inMyDistricts(item, ctx.viewerDistricts)
    ) {
      return false;
    }
    return true;
  }

  if (scope === "jurisdiction") {
    if (item.jurisdiction !== filter.jurisdiction) return false;
    if (
      effectiveMyDistricts(filter, ctx, tierMin) &&
      !inMyDistricts(item, ctx.viewerDistricts)
    ) {
      return false;
    }
    return true;
  }

  if (scope === "district") {
    return !!filter.districtSlug && item.districts.includes(filter.districtSlug);
  }

  return false;
}
