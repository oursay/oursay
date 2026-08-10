// Jurisdiction — the domain partition for civic identity and rules. A jurisdiction (e.g.
// `ab-ca-gov`, `ca-gov`) is one chain + one rule set + one governmental LEVEL, and is 1:1 with a
// chain (the append-only ledger). `level` is a PROPERTY of the jurisdiction, never a partition key
// on its own. See docs/01-CONTRIBUTOR-SPEC §6.0 (canonical vocabulary).
//
// This module is the "jurisdiction router" seam doc 08 §9 anticipated: it maps a `jurisdictionId`
// to its config (level + default gating rules + privacy/count-exposure policy). The API composition
// root registers EVERY configured jurisdiction at startup (from @oursay/jurisdiction-data —
// `oursay-global` + `ab-ca-gov` today), so reads resolve policy per thread's audience jurisdiction;
// env (`JURISDICTION_ID`) only selects the deployment DEFAULT id. The jurisdiction's id is realized as
// the chain's `chainId` value at the ledger boundary — the ledger layer keeps the word "chain".

import {
  DEFAULT_CONTENT_LIMITS,
  type JurisdictionContentLimits,
} from "@oursay/content-limits";
import { jurisdictionConfig } from "./config.js";
import type { RecordType, SignScheme } from "./schema/types.js";

export { DEFAULT_CONTENT_LIMITS, type JurisdictionContentLimits };

/** Default gating rules for a jurisdiction. An entity may override these within what the
 *  jurisdiction permits (see {@link resolveRules} in governance.ts). Platform defaults are LOOSE
 *  (change/revoke allowed — WEB-APP-GAPS Part 6 #4); a jurisdiction tightens to FINAL via config. */
export interface JurisdictionRules {
  allowChange?: boolean; // votes may change before the deadline
  allowRevoke?: boolean; // signatures may be revoked before the deadline
  defaultDeadline?: string; // ISO 8601 default close time when an entity sets none
  /** @deprecated superseded by {@link JurisdictionGates} (`gates[action].signMin`). Still honored as
   *  the fallback scheme for jurisdictions registered without gates. */
  signing?: { defaultScheme?: SignScheme };
}

// ── Per-action gates (WEB-APP-GAPS Part 3 + Part 6 corrections) ─────────────────────────────────

/** Platform-scoped account roles (`auth.account_roles`). Distinct from jurisdiction Official
 *  (`{ role: "official" }` on membership). Values mirror the api PlatformRole CHECK list. */
export type PlatformGateRole = "admin" | "dev" | "mod" | "auditor" | "support";

/** Who may perform an action. Tier ids are KYC verification-tier slugs kept as plain strings so this
 *  package stays free of the api KYC enum (mirrors {@link JurisdictionCountExposure.minTier}). */
export type GateActor =
  | "anyone" // any registered account
  | { tiers: string[] } // set membership over the caller's CURRENT tier
  | { residencyIn: "jurisdiction" } // residency_verified AND current point ∈ the jurisdiction
  | { role: "official" } // jurisdiction Official on membership — never a tier
  | { mediaAccredited: true } // valid Media accreditation whose body ∈ recognizedAccreditationBodyIds
  | { platformRole: PlatformGateRole }; // platform-wide role on auth.account_roles

/** Minimum signing method for an action. `quick` accepts a software p256 envelope; `passkey`
 *  requires a UV-verified WebAuthn assertion (webauthn-es256). A user preference may exceed the
 *  floor — strongest wins; the floor is what the engine enforces. */
export type SignMethod = "quick" | "passkey";

/** One action's gate. `officialCount` is a COUNTING floor, never a participation barrier (Part 6
 *  #2): anyone the `act` gate admits participates; below-floor actions bunch into unverified counts.
 *  `deny` names actors excluded from the action — enforcement is per action type (Part 6 #3): a
 *  denied `vote` is act-blocked at write time; a denied `petition_signature` is accepted on the
 *  record but EXCLUDED from official counts with reason tag `official_role`.
 *  When `act` is an array, any matching actor may perform the action (OR). */
export interface ActionGate {
  act: GateActor | GateActor[];
  signMin: SignMethod;
  officialCount?: GateActor; // absent ⇒ same as act (OR when act is an array)
  deny?: GateActor[];
}

/** The gated actions: the four root types (result included — automated, attributed to the poll's
 *  author; Part 6 #1), the attachments, and the singletons. */
export type GatedAction =
  | "post"
  | "petition"
  | "poll"
  | "result"
  | "comment"
  | "reaction"
  | "vote"
  | "petition_signature";

export type JurisdictionGates = Record<GatedAction, ActionGate>;

/** Graduation policy (petition → forced poll at threshold; Part 6 #9). Config only — the forced-poll
 *  engine consumes this; threshold is platform-set at create, never author-set. */
export interface JurisdictionGraduation {
  /** `fixed` = an absolute signature count; `percentOfVerified` = % of the jurisdiction's verified
   *  users (moving target, or frozen at petition create). */
  threshold: { kind: "fixed"; n: number } | { kind: "percentOfVerified"; percent: number; basis: "moving" | "atCreate" };
  /** Whether jurisdiction officials may promote a petition to a poll before the threshold. */
  officialEarlyPromotion?: boolean;
}

/** Every civic record type maps to the gate action that governs it. `platform_ops` is not gated
 *  here — it uses the platform-ops append path (admin role + platform envelope), not act gates. */
export function actionForType(type: RecordType): GatedAction {
  if (type === "platform_ops") {
    throw new Error("platform_ops is not a gated civic action");
  }
  return type as GatedAction;
}

/** Platform default gates: everything open to any registered account at the quick floor. A
 *  jurisdiction config overrides per action; absent config falls back here. */
export const DEFAULT_GATES: JurisdictionGates = {
  post: { act: "anyone", signMin: "quick" },
  petition: { act: "anyone", signMin: "quick" },
  poll: { act: "anyone", signMin: "quick" },
  result: { act: "anyone", signMin: "quick" },
  comment: { act: "anyone", signMin: "quick" },
  reaction: { act: "anyone", signMin: "quick" },
  vote: { act: "anyone", signMin: "quick" },
  petition_signature: { act: "anyone", signMin: "quick" },
};

/** Resolve one action's effective gate for a jurisdiction (config override or platform default). */
export function gateFor(action: GatedAction, jurisdictionId?: string): ActionGate {
  return getJurisdiction(jurisdictionId).gates?.[action] ?? DEFAULT_GATES[action];
}

/** Per-jurisdiction privacy policy. The first member is the k-anonymity floor a deployment may raise
 *  above the platform default for geo/tier-filtered public counts (docs/06 §3 — minimum-aggregation
 *  thresholds). A deployment can only RAISE the floor: consumers resolve it as
 *  `max(platformMin, kAnonymityFloor ?? platformDefault)`, so a value below the platform minimum is
 *  ignored, never weakening it. */
export interface JurisdictionPrivacy {
  kAnonymityFloor?: number;
}

/** Per-jurisdiction PUBLIC COUNT EXPOSURE policy (docs/06 §2 minimum-aggregation; docs/01 §7 public
 *  API). Governs whether vote/signature scalars may appear on the public read surfaces at all — a
 *  layer ABOVE the geo/tier filtering + k-anonymity floor (those decide which participants count and
 *  whether a small bucket is suppressed; this decides whether the scalar is disclosed in the first
 *  place). Tier ids are KYC verification-tier slugs kept as plain strings here so this package stays
 *  free of the api KYC enum. Reaction tallies are never gated through this seam. */
export interface JurisdictionCountExposure {
  votes: boolean; // poll option tallies publicly exposable
  signatures: boolean; // petition signature scalar publicly exposable
  /** When non-empty, votes/signatures are exposed only when the request restricts to a tier set that
   *  is a SUBSET of these tiers (tier-gated); otherwise the scalar is withheld. Empty/absent ⇒ no
   *  extra tier gate (the flag alone decides). */
  minTier?: string[];
}

/** Per-jurisdiction USER-FACING display labels for the canonical record types (docs/GLOSSARY
 *  "Civic content vocabulary"). Display only — NEVER a partition key or dev term. Absent keys ⇒
 *  client falls back to {@link DEFAULT_LABELS}. `result` and `district` are PRODUCT labels, not
 *  RecordTypes, so this is its own keyset rather than keyed on RecordType. */
export interface JurisdictionLabels {
  post?: string;
  petition?: string;
  poll?: string;
  result?: string;
  district?: string;
}

/** Platform default user-facing labels (the "Statement → Petition → Poll → Result" hierarchy). */
export const DEFAULT_LABELS: Required<JurisdictionLabels> = {
  post: "Statement",
  petition: "Petition",
  poll: "Poll",
  result: "Result",
  district: "District",
};

/** A jurisdiction's configuration: its id, governmental level, and default rules. Censoring /
 *  expiry policy is a per-jurisdiction extension point that will hang off this shape; `privacy`
 *  (k-anonymity floor) and `counts` (public count exposure) are the first such extensions.
 *
 *  FUTURE (transparency / audit): standing jurisdiction policy uses the **platform_ops** dual-sign
 *  path (admin clear-request attestation + platform-signed envelope). Packaged jurisdiction data is
 *  the bootstrap input; the active database projection is linked to its signed config transaction. */
export interface JurisdictionConfig {
  id: string;
  level: string; // federal | provincial | municipal | state | …
  /** Optional public DISPLAY name for the jurisdiction (e.g. "Alberta"), surfaced by the public area
   *  catalog (`GET /v1/public/jurisdictions`). Display only — never a partition key; absent ⇒ clients
   *  fall back to the id. Distinct from {@link labels} (the per-record-type display map): `label` names
   *  the JURISDICTION itself; `labels` names what it calls each record type. */
  label?: string;
  rules: JurisdictionRules;
  privacy?: JurisdictionPrivacy;
  counts?: JurisdictionCountExposure;
  /** Per-record-type user-facing display labels (e.g. Alberta calls a `post` a "Statement", a district
   *  a "riding"). Display only; absent keys ⇒ {@link DEFAULT_LABELS}. */
  labels?: JurisdictionLabels;
  /** Hard per-type content caps. Defined + exposed here; enforced by per-type validators elsewhere. */
  contentLimits?: JurisdictionContentLimits;
  /** Per-action gates (act / signMin / officialCount / deny). Absent ⇒ {@link DEFAULT_GATES}.
   *  Supersedes `rules.signing.defaultScheme` and the retired vote/petition_signature hard override. */
  gates?: JurisdictionGates;
  /** Petition→poll graduation policy (config only; the forced-poll engine consumes it). */
  graduation?: JurisdictionGraduation;
  /**
   * Platform-catalog accreditation-body ids OurSay **chooses to recognize** for Media-gated acts in
   * this jurisdiction (e.g. poll create where gates allow `{ mediaAccredited: true }`). Ids only —
   * never free-text body names; bodies live in `auth.accreditation_bodies`. Empty/absent ⇒ no one is
   * media-accredited here (platform Media mark may still show from any valid catalog accreditation).
   *
   * Interim: authored in `@oursay/jurisdiction-data`. Future: same platform-signed chain ingestion as
   * other standing jurisdiction policy (see interface FUTURE note above).
   */
  recognizedAccreditationBodyIds?: string[];
  /** Optional public-facing jurisdiction leader (display only; no profile link yet). */
  leader?: { name: string; handle: string };
  /** User-facing rules copy for the jurisdiction view (display only). */
  rulesCopy?: string[];
}

const registry = new Map<string, JurisdictionConfig>();

/** Register (or replace) a jurisdiction in the in-process router. */
export function registerJurisdiction(j: JurisdictionConfig): void {
  registry.set(j.id, j);
}

/** Resolve a jurisdiction by id, falling back to the deployment's configured default. */
export function getJurisdiction(id: string = jurisdictionConfig.id): JurisdictionConfig {
  return registry.get(id) ?? jurisdictionConfig;
}

/** True only when `id` is explicitly registered — no deployment-default fallback. */
export function hasJurisdiction(id: string): boolean {
  return registry.has(id);
}

/**
 * Resolve a jurisdiction by id, fail-closed. Unlike {@link getJurisdiction}, unknown ids do NOT
 * fall back to the deployment default — write paths (join / prepare / submit) must reject them.
 */
export function requireJurisdiction(id: string): JurisdictionConfig {
  const j = registry.get(id);
  if (!j) {
    throw Object.assign(new Error(`unknown jurisdiction: ${id}`), { code: "unknown_jurisdiction" });
  }
  return j;
}

/**
 * The signature scheme a record TYPE must be signed with, or `null` when any accepted scheme is fine.
 * Resolved by type (not op), so it gates a vote's `create` AND `update`, and a petition_signature's
 * `create` AND `delete` (revoke). Gate-driven ([align-w3-gates-schema]): the jurisdiction's
 * `gates[action].signMin` decides — `passkey` ⇒ `webauthn-es256` (UV-verified assertion), `quick` ⇒
 * any accepted scheme (a software `p256` envelope suffices; a user preference may still exceed the
 * floor). The former platform-wide vote/petition_signature hard override is RETIRED — per-action
 * floors are jurisdiction policy now. Jurisdictions registered without gates fall back to the
 * deprecated `rules.signing.defaultScheme`, else the platform default (quick).
 */
export function requiredSignScheme(type: RecordType, jurisdictionId?: string): SignScheme | null {
  if (type === "platform_ops") return null;
  const j = getJurisdiction(jurisdictionId);
  const gate = j.gates?.[actionForType(type)];
  if (gate) return gate.signMin === "passkey" ? "webauthn-es256" : null;
  return j.rules.signing?.defaultScheme ?? null;
}
