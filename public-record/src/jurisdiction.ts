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

import { jurisdictionConfig } from "./config.js";
import type { RecordType, SignScheme } from "./schema/types.js";

/** Default gating rules for a jurisdiction. An entity may override these within what the
 *  jurisdiction permits (see {@link resolveRules} in governance.ts). Defaults are FINAL-action
 *  semantics: a vote is cast and a signature is signed with no change/revoke unless opted in. */
export interface JurisdictionRules {
  allowChange?: boolean; // votes may change before the deadline
  allowRevoke?: boolean; // signatures may be revoked before the deadline
  defaultDeadline?: string; // ISO 8601 default close time when an entity sets none
  /** Signing policy. `defaultScheme` is the scheme NON-forced record types must use (null/absent ⇒
   *  any accepted). The forced types (vote, petition_signature) are a HARD override below. */
  signing?: { defaultScheme?: SignScheme };
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

/** Hard content caps per record type, enforced at create/update by per-type validators
 *  ([code-post-content-fields]) — this config only DEFINES + EXPOSES them. Per-type nested numeric
 *  caps; absent type/field ⇒ no cap from this seam. */
export interface JurisdictionContentLimits {
  post?: { title?: number; body?: number };
  comment?: { body?: number };
  petition?: { title?: number; text?: number };
  poll?: { question?: number; option?: number; maxOptions?: number; description?: number };
}

/** Platform default user-facing labels (the "Statement → Petition → Poll → Result" hierarchy). */
export const DEFAULT_LABELS: Required<JurisdictionLabels> = {
  post: "Statement",
  petition: "Petition",
  poll: "Poll",
  result: "Result",
  district: "District",
};

/** Platform default content caps (the documented Alberta/launch caps; also the global defaults). */
export const DEFAULT_CONTENT_LIMITS: JurisdictionContentLimits = {
  post: { title: 200, body: 2000 },
  comment: { body: 2000 },
  petition: { title: 200, text: 5000 },
  poll: { question: 200, option: 100, maxOptions: 10, description: 2000 },
};

/** A jurisdiction's configuration: its id, governmental level, and default rules. Censoring /
 *  expiry policy is a per-jurisdiction extension point that will hang off this shape; `privacy`
 *  (k-anonymity floor) and `counts` (public count exposure) are the first such extensions. */
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

/**
 * The signature scheme a record TYPE must be signed with, or `null` when any accepted scheme is fine.
 * Resolved by type (not op), so it gates a vote's `create` AND `update`, and a petition_signature's
 * `create` AND `delete` (revoke). `vote` and `petition_signature` are a HARD override — these
 * highest-stakes singletons MUST use `webauthn-es256` (genuine per-action user verification),
 * regardless of jurisdiction config. Other types fall back to the jurisdiction's `defaultScheme`.
 */
export function requiredSignScheme(type: RecordType, jurisdictionId?: string): SignScheme | null {
  if (type === "vote" || type === "petition_signature") return "webauthn-es256";
  return getJurisdiction(jurisdictionId).rules.signing?.defaultScheme ?? null;
}
