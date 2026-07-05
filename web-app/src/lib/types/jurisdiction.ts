import type { VerificationTier } from "./verification";

/**
 * Stable jurisdiction ids — the LOGIC key everywhere (corpus rows, subscriptions,
 * gate/config lookups, read-model comparisons). Display labels (`"Global"`,
 * `"Alberta"`) live on {@link JurisdictionSummary.name} and are for rendering
 * only. Mirrors the backend jurisdiction ids (`@oursay/jurisdiction-data`), so
 * the W5 fetch swap is a pass-through.
 */
export const GLOBAL_ID = "oursay-global";
export const ALBERTA_ID = "ab-ca-gov";

/** A jurisdiction id (mirrors the backend registry keys). */
export type JurisdictionId = string;

/** Governance level — drives the header glyph and rules copy, not logic gates. */
export type JurisdictionLevel = "global" | "province";

/**
 * Who may perform an action (Part 3 gate shape, mirrored from
 * `@oursay/public-record` `GateActor`). The web-app expresses the tier set with
 * numeric {@link VerificationTier}s (identity_verified ⇒ 1, residency_verified ⇒
 * 2) rather than the backend's KycTier strings; the served config in W5 maps
 * back. `residencyIn` means residency-verified AND resident of the jurisdiction
 * (the mock approximates it as tier ≥ 2 when composing in that jurisdiction).
 */
export type GateActor =
  | "anyone"
  | { tiers: VerificationTier[] }
  | { residencyIn: "jurisdiction" }
  | { role: "official" };

/** Minimum signing method a gate mandates (a user preference may exceed it). */
export type SignFloor = "quick" | "passkey";

/**
 * One action's gate (mirror of `@oursay/public-record` `ActionGate`).
 * `officialCount` is a COUNTING floor, never a participation barrier (Part 6 #2);
 * `deny` names actors excluded from the action (Part 6 #3): a denied `vote` is
 * act-blocked, a denied `petition_signature` is accepted but excluded from
 * official counts (reason `official_role`).
 */
export interface ActionGate {
  act: GateActor;
  signMin: SignFloor;
  officialCount?: GateActor;
  deny?: GateActor[];
}

/** The gated actions — the four root types (result included, Part 6 #1), the
 *  attachments, and the singletons. Keyed by the CANONICAL type (`post`, not
 *  `statement`). */
export type GatedAction =
  | "post"
  | "petition"
  | "poll"
  | "result"
  | "comment"
  | "reaction"
  | "vote"
  | "petition_signature";

/** Per-action gate table for a jurisdiction (mirror of the backend `gates`). */
export type JurisdictionGates = Record<GatedAction, ActionGate>;

/** A jurisdiction's leader (name only; the seat/role is inferred from the jurisdiction). */
export interface JurisdictionLeader {
  name: string;
  /** Mock profile handle for the jurisdiction leader. */
  handle: string;
}

/** A district (riding) within a jurisdiction, as listed on the Jurisdiction view. */
export interface DistrictSummary {
  name: string;
  /** Year-less riding slug — matches district page routes. */
  slug: string;
  /** Riding leader display name (e.g. the MLA). */
  leader: string;
  /** Mock profile handle for the riding leader. */
  leaderHandle: string;
}

/**
 * Jurisdiction summary for the Jurisdiction view (the wireframe's JUR_DATA).
 * Keyed in `JUR_DATA` by {@link id}; {@link name} is the display label. Global
 * has neither a district map nor ridings (districtLabel null, districts []).
 */
export interface JurisdictionSummary {
  /** Stable logic id, e.g. `"ab-ca-gov"` — the key in JUR_DATA and on corpus rows. */
  id: JurisdictionId;
  /** URL slug for `/jurisdiction/<slug>` routes (friendly, e.g. `"alberta"`). */
  slug: string;
  /** Display label, e.g. `"Alberta"` — rendering only, never a logic key. */
  name: string;
  level: JurisdictionLevel;
  leader: JurisdictionLeader;
  rules: string[];
  /** Per-action gate table (compose eligibility + sign floors derive from this). */
  gates: JurisdictionGates;
  /** Label for the district collection, e.g. "Ridings"; null when none. */
  districtLabel: string | null;
  districts: DistrictSummary[];
}

/**
 * District detail for the District view (the wireframe's DISTRICT). The
 * representative riding; production loads by slug.
 */
export interface DistrictDetail {
  name: string;
  slug: string;
  /** Parent jurisdiction id (e.g. `"ab-ca-gov"`) — routes nest under it. */
  jur: JurisdictionId;
  leader: string;
  /** Mock profile handle for the riding leader (MLA). */
  leaderHandle: string;
  boundaryYear: number;
  source: string;
  about: string[];
}
