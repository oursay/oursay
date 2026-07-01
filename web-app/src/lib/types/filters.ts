import type { RecordKind } from "./records";
import type { VerificationTier } from "./verification";

/** List scope a matcher runs in (the wireframe's feed-bearing views). */
export type FeedScope = "feed" | "jurisdiction" | "district";

/**
 * A subscribed jurisdiction and whether it's included in the unified feed.
 * Mirrors the wireframe's `state.subs[]` (persisted to a cookie, works logged-out).
 */
export interface JurisdictionMembership {
  name: string;
  included: boolean;
}

/**
 * The two geography filters, independent of the Verified ladder.
 * - myDistricts keeps all Global posts + limits jurisdiction content to my ridings.
 * - affected is a Post-page comment filter only (see read-model/geography).
 */
export interface Geography {
  myDistricts: boolean;
  affected: boolean;
}

/**
 * Read-model filter inputs. Replaces the wireframe's global filter `state`
 * (recordTypes / verified / myDistricts / subs) for the pure matcher.
 */
export interface FeedFilterParams {
  /**
   * Subscribed jurisdictions with include flags — mirrors `state.subs[].included`.
   * Consumed by feed-scope matches only; seeded from getJurisdictionMembership().
   */
  jurisdictions?: JurisdictionMembership[];
  /** Included record kinds. Undefined means "all kinds included". */
  types?: RecordKind[];
  /** Minimum author tier, inclusive-upward (`tier >= tierMin`). */
  tierMin?: VerificationTier;
  /** Geography filters. */
  geography?: Geography;
  /** For jurisdiction scope: the jurisdiction name the view is pinned to. */
  jurisdiction?: string;
  /** For district scope: the district slug the view is pinned to. */
  districtSlug?: string;
}
