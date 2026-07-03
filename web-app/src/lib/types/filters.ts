import type { RecordKind } from "./records";
import type { SignedFilterLevel } from "./sign-tier";
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
 * How a geography refinement composes with the other refine filters:
 * - "inclusive" broadens — district matches are OR'd into the results, kept
 *   even when they fail the Verified/Signed refinements.
 * - "exclusive" narrows — only district matches, AND'd with the refinements.
 */
export type GeoFilterMode = "off" | "inclusive" | "exclusive";

/** Row-tap cycle for a geography refinement: Off -> Include -> Only -> Off. */
export function nextGeoFilterMode(mode: GeoFilterMode): GeoFilterMode {
  return mode === "off" ? "inclusive" : mode === "inclusive" ? "exclusive" : "off";
}

/**
 * The three geography filters.
 * - myDistricts keeps all Global posts + broadens/narrows jurisdiction content
 *   to my ridings depending on its mode.
 * - affected is a Post-page comment filter only (see read-model/geography).
 * - myJurisdiction is AUTHOR-RESIDENCE based on every scope: does the post's /
 *   comment's author live in one of the scope's jurisdictions? District-less
 *   tier-3 officials count as residents of the jurisdiction they represent.
 */
export interface Geography {
  myDistricts: GeoFilterMode;
  affected: GeoFilterMode;
  /** Absent reads as "off" (the read-model defaults it). */
  myJurisdiction?: GeoFilterMode;
  /**
   * District-slug universe the myJurisdiction filter matches authors against:
   * the scope's jurisdiction districts (union across a multi-jurisdiction
   * feed). undefined/[] means a district-less jurisdiction (e.g. Global) is in
   * scope — there the filter would mirror Verified: Residency, so it is gated
   * off entirely (see read-model effectiveMyJurisdiction).
   */
  jurisdictionDistricts?: string[];
  /**
   * Which filter last entered exclusive — the tie-break when both are
   * exclusive on a post outside my districts (the loser is temporarily
   * auto-disabled; see read-model resolveGeography). myJurisdiction never
   * conflicts: its population is a superset of both wherever it is engaged.
   */
  priority?: "myDistricts" | "affected";
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
  /**
   * Signed Refine ladder: 0 Any · 1 Passkey · 2 Biometric (inclusive-upward on
   * signTier). Independent of tierMin and geography.
   */
  signedFilter?: SignedFilterLevel;
  /** For jurisdiction scope: the jurisdiction name the view is pinned to. */
  jurisdiction?: string;
  /** For district scope: the district slug the view is pinned to. */
  districtSlug?: string;
}
