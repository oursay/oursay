// Jurisdiction — the domain partition for civic identity and rules. A jurisdiction (e.g.
// `ab-ca-gov`, `ca-gov`) is one chain + one rule set + one governmental LEVEL, and is 1:1 with a
// chain (the append-only ledger). `level` is a PROPERTY of the jurisdiction, never a partition key
// on its own. See docs/01-CONTRIBUTOR-SPEC §6.0 (canonical vocabulary).
//
// This module is the "jurisdiction router" seam doc 08 §9 anticipated: it maps a `jurisdictionId`
// to its config (level + default gating rules). Today a deployment serves one jurisdiction (the
// env-configured default); the registry lets later deployments host several. The jurisdiction's id
// is realized as the chain's `chainId` value at the ledger boundary — the ledger layer keeps the
// word "chain".

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

/** A jurisdiction's configuration: its id, governmental level, and default rules. Censoring /
 *  expiry policy is a per-jurisdiction extension point that will hang off this shape; `privacy` is
 *  the first such extension (k-anonymity floor for public count disclosure). */
export interface JurisdictionConfig {
  id: string;
  level: string; // federal | provincial | municipal | state | …
  rules: JurisdictionRules;
  privacy?: JurisdictionPrivacy;
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
