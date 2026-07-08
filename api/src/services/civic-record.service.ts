// CivicRecordService: the authenticated civic WRITE path (docs/08 §6; public-record R1/R2/R7). Thin
// orchestration over @oursay/identity/server's IdentityRegistry — it owns NO crypto. Three operations:
//   - join:    bind account↔thread-key ownership (platform-signed binding + per-thread civic
//              credential). No KYC tier is fixed at join; verification tier is applied at read/count time.
//   - prepare: compute the server-derived fields a client must sign over for one civic intent.
//   - submit:  accept a client-signed envelope into the verified record pool.
// Auth/ownership lives here so HTTP routes stay thin: the caller's userId (from the session) must own
// the author persona (the thread key pubkey). Per-action jurisdiction gates ([align-w3-gates-schema])
// are enforced fail-closed at BOTH prepare (early, actionable rejection) and submit (authoritative).
// The accepted signature scheme is gate-driven: a `passkey` floor requires a UV-verified
// webauthn-es256 assertion; a `quick` floor also accepts a software p256 envelope (still
// device-signed — `signerPubkey` must be an enrolled, non-revoked thread credential either way).
// The RecordService underneath re-verifies the assertion/signature, binding, and floor policy.

import type { IdentityRegistry } from "@oursay/identity/server";
import type { Intent, JoinThreadResponse, PreparedAppend, SignedSubmission } from "@oursay/identity";
import { actionForType, isRootType, opAllowed, requiredSignScheme, rulesOf } from "@oursay/public-record";
import type { Op, PrivateStore, RecordType, Ref, TxEnvelope } from "@oursay/public-record";
import type { GeoStore, RegionResolver } from "@oursay/geo";
import { ServiceError } from "../errors.js";
import type { GateService } from "./gate.service.js";
import type { KycService } from "./kyc.service.js";
import type { ParticipantGeoService } from "./participant-geo.service.js";

/** Compressed-or-uncompressed SEC1 P-256 point, lowercase hex (33 or 65 bytes → 66 or 130 chars). */
const PUBKEY_HEX = /^(02|03)[0-9a-f]{64}$|^04[0-9a-f]{128}$/;
/** A sha256 commitment (32 bytes → 64 hex chars). */
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** The civic op types implemented in public-record (op-eligibility checked via opAllowed). */
const RECORD_TYPES = new Set<RecordType>([
  "post",
  "comment",
  "reaction",
  "petition",
  "petition_signature",
  "poll",
  "vote",
  "result",
]);
const OPS = new Set<Op>(["create", "update", "delete"]);

export interface JoinThreadInput {
  userId: string;
  threadId: string;
  jurisdiction: string;
  /** The CALLING device's per-thread WebAuthn passkey pubkey (envelope `signerPubkey`). Under the
   *  mvp-a5b persona/signer split the server is the authority on whether this becomes Pₜ (first
   *  device wins) or is enrolled as an additional signer under an existing Pₜ for (user, thread). */
  signerPubkey: string;
  commitment: string;
}

export interface PrepareInput {
  userId: string;
  /** The thread persona pubkey the action is authored as (must belong to the caller). */
  author: string;
  intent: Intent;
}

export interface SubmitInput {
  userId: string;
  submission: SignedSubmission;
}

export interface CivicRecordServiceDeps {
  registry: IdentityRegistry;
  /** Read-only ownership lookups (device/persona/signer → user). The registry holds the write store. */
  store: PrivateStore;
  /** Fail-closed per-action act-gate enforcement (tiers / residency / role / deny). */
  gateService: GateService;
  /** tierAtAction for the C6 relationship snapshot. */
  kycService: KycService;
  /** in_jurisdiction / in_affected resolution for the C6 relationship snapshot. */
  participantGeoService: ParticipantGeoService;
  /** Compiles the root entity's geographic stake into a Region for the in_affected flag. */
  regionResolver: RegionResolver;
  /** District slug → effective revision resolution for the entity_audience projection. */
  geoStore: GeoStore;
}

export class CivicRecordService {
  constructor(private readonly d: CivicRecordServiceDeps) {}

  /**
   * Join a thread (mvp-a5b persona/signer split). The caller sends THIS device's per-thread WebAuthn
   * passkey pubkey as `signerPubkey`; the server resolves Pₜ (first-wins per `(user, thread)`),
   * platform-signs the credential attestation, and writes a `thread_civic_credentials` row for the
   * device under that Pₜ. Subsequent joins for the same (user, thread) reuse the established Pₜ; a
   * different commitment under that persona is rejected. No `kycTier` is stored at join.
   *
   * Returns the canonical Pₜ so the caller persists it before any prepare/submit.
   */
  async join(input: JoinThreadInput): Promise<JoinThreadResponse> {
    const signerPubkey = hexPubkey(input.signerPubkey, "signerPubkey");
    const commitment = input.commitment?.trim().toLowerCase();
    if (!commitment || !SHA256_HEX.test(commitment)) {
      throw new ServiceError("validation", "commitment must be a sha256 hex digest");
    }
    const threadId = nonEmpty(input.threadId, "threadId");
    const jurisdiction = nonEmpty(input.jurisdiction, "jurisdiction");

    try {
      return await this.d.registry.joinThread({
        userId: input.userId,
        threadId,
        jurisdiction,
        signerPubkey,
        commitment,
      });
    } catch (err) {
      throw asServiceError(err, "validation");
    }
  }

  /**
   * Compute the server-derived fields the client must sign over for a civic intent. The persona the
   * action is authored as must belong to the caller (registered via a prior join).
   */
  async prepare(input: PrepareInput): Promise<PreparedAppend> {
    const author = hexPubkey(input.author, "author");
    validateIntent(input.intent);

    const owner = await this.d.store.getThreadKey(author);
    if (!owner) throw new ServiceError("not_found", "Author persona is not registered (join the thread first)");
    if (owner.userId !== input.userId) throw new ServiceError("forbidden", "That persona belongs to another account");

    // Early act-gate rejection (same check submit re-runs authoritatively) so the client learns it
    // is locked out BEFORE running a signing ceremony.
    await this.d.gateService.assertAct(input.userId, actionForType(input.intent.type as RecordType), owner.jurisdiction);

    try {
      return await this.d.registry.prepare(input.intent, author);
    } catch (err) {
      throw asServiceError(err, "validation");
    }
  }

  /**
   * Accept a client-signed envelope into the verified record pool (mvp-a5b persona/signer split).
   * The accepted scheme is GATE-DRIVEN ([align-w3-gates-schema]): where the jurisdiction's floor for
   * this action is `passkey` the envelope must carry a UV-verified webauthn-es256 assertion; a
   * `quick` floor also accepts a software `p256` envelope (a preference may exceed the floor —
   * strongest wins). Both paths are device-signed: `signerPubkey` (this device's per-thread key)
   * must be a registered, non-revoked credential of the caller, enrolled under the envelope's
   * `authorPubkey` (= Pₜ), which itself must resolve to the caller. The RecordService then
   * re-verifies the signature, the platform binding under Pₜ, the credential attestation, AND the
   * jurisdiction floor (defense in depth) before pooling.
   */
  async submit(input: SubmitInput): Promise<Ref> {
    const envelope = input.submission?.envelope;
    if (!envelope || typeof envelope !== "object") {
      throw new ServiceError("validation", "submission.envelope is required");
    }
    if (!envelope.signerPubkey) {
      throw new ServiceError("validation", "the envelope requires a signerPubkey (this device's thread signing pubkey)");
    }
    const persona = await this.d.store.getThreadKey(envelope.authorPubkey);
    if (!persona || persona.userId !== input.userId) {
      throw new ServiceError("forbidden", "That author persona belongs to another account");
    }

    // Signing floor: `passkey` ⇒ webauthn-es256 only; `quick` (null) ⇒ p256 also accepted.
    const scheme = envelope.signScheme ?? "p256";
    const floor = requiredSignScheme(envelope.type, persona.jurisdiction);
    if (floor === "webauthn-es256" && scheme !== "webauthn-es256") {
      throw new ServiceError("forbidden", "This action requires a passkey signature in this jurisdiction", {
        action: actionForType(envelope.type),
        jurisdictionId: persona.jurisdiction,
        reason: "passkey_required",
      });
    }
    if (scheme === "webauthn-es256" && !envelope.webauthn) {
      throw new ServiceError("validation", "a webauthn-es256 envelope requires a webauthn assertion");
    }

    const cred = await this.d.store.getThreadCredential(envelope.signerPubkey);
    if (!cred || cred.userId !== input.userId) {
      throw new ServiceError("forbidden", "That signer credential is not enrolled to this account");
    }
    if (cred.revoked) {
      throw new ServiceError("forbidden", "That signer credential is revoked");
    }
    if (cred.personaPubkey !== envelope.authorPubkey || cred.threadId !== persona.threadId) {
      throw new ServiceError("forbidden", "That signer credential is not enrolled under this author persona/thread");
    }

    // Authoritative act-gate check (prepare's early check can be raced/bypassed by a stale client).
    await this.d.gateService.assertAct(input.userId, actionForType(envelope.type), persona.jurisdiction);

    let ref: Ref;
    try {
      ref = await this.d.registry.submit(input.submission);
    } catch (err) {
      throw asServiceError(err, "validation");
    }

    // Post-submit projections (C6 relationship snapshot + entity_audience) are BEST-EFFORT: the tx
    // is already pooled/appended, so a projection failure must never fail the accepted write.
    try {
      await this.project(input.userId, envelope, persona.jurisdiction);
    } catch {
      /* read models tolerate a missing snapshot row (pre-W3 rows have none) */
    }
    return ref;
  }

  /** Write the per-tx relationship snapshot (record_action_geo) and, for a ROOT create carrying a
   *  geographic stake, the district-slug audience projection (entity_audience). */
  private async project(userId: string, envelope: TxEnvelope, jurisdictionId: string): Promise<void> {
    const now = new Date();

    // Root = the entity itself for root types, else the parent chain walked to its top (vote → poll,
    // comment → … → root; depth is capped by COMMENT_MAX_DEPTH, the bound is just a safety rail).
    let root = await this.d.store.getEntityState(envelope.entityId);
    for (let hops = 0; root?.parentId && hops < 8; hops++) {
      root = await this.d.store.getEntityState(root.parentId);
    }
    const rootRules = root ? rulesOf(root.content) : {};

    // in_affected: the participant's current point against the root's compiled geographic stake
    // (absent stake ⇒ the whole jurisdiction extent — geographyless jurisdictions resolve false).
    const region = await this.d.regionResolver.compileScope({
      scope: "impacted-region",
      jurisdictionId,
      appliesToRegion: rootRules.appliesToRegion,
      appliesToDistrictIds: rootRules.appliesToDistrictIds,
      asOf: now,
    });
    const ref = { authorPubkey: envelope.authorPubkey };
    const [tierAtAction, viewerDistrictId, inAffected] = await Promise.all([
      this.d.kycService.currentTier(userId),
      this.d.participantGeoService.viewerDistrictId(userId, jurisdictionId, now),
      region ? this.d.participantGeoService.participantInRegion(ref, region, now) : Promise.resolve(false),
    ]);

    await this.d.store.putRecordActionGeo({
      txId: envelope.txId,
      entityId: envelope.entityId,
      inAffected,
      inJurisdiction: viewerDistrictId !== null,
      tierAtAction,
    });

    // entity_audience: the frontend's district-slug projection of a root's stake (C2). Only root
    // creates carry one; updates that change the stake are platform-governance territory (later).
    if (envelope.op === "create" && isRootType(envelope.type) && root?.entityId === envelope.entityId) {
      const rows = await this.resolveAudience(jurisdictionId, rootRules, now);
      await this.assertAudienceInJurisdiction(jurisdictionId, rows, rootRules);
      if (rows.length > 0) await this.d.store.replaceEntityAudience(envelope.entityId, jurisdictionId, rows);
    }
  }

  /** Reject district stakes that reference seats outside the thread's jurisdiction. */
  private async assertAudienceInJurisdiction(
    jurisdictionId: string,
    rows: { districtSlug: string; revisionId: string }[],
    rules: { appliesToDistrictIds?: string[] },
  ): Promise<void> {
    for (const row of rows) {
      const owner = await this.d.geoStore.districtJurisdiction(row.revisionId);
      if (owner !== jurisdictionId) {
        throw new ServiceError(
          "validation",
          `district ${row.districtSlug} is not in jurisdiction ${jurisdictionId}`,
        );
      }
    }
    for (const entry of rules.appliesToDistrictIds ?? []) {
      const slug = /^(.+)-(\d{4})$/.exec(entry)?.[1] ?? entry;
      const revisionId = rows.find((r) => r.districtSlug === slug)?.revisionId;
      if (!revisionId) continue;
      const owner = await this.d.geoStore.districtJurisdiction(revisionId);
      if (owner !== jurisdictionId) {
        throw new ServiceError(
          "validation",
          `district ${slug} is not in jurisdiction ${jurisdictionId}`,
        );
      }
    }
  }

  /** Map a root's stake to (districtSlug, revisionId) rows. `appliesToDistrictIds` entries may be
   *  stable seat slugs OR revision ids (`<slug>-YYYY`); `appliesToRegion` contributes its base
   *  `district:<slug>` refs. Unresolvable entries are skipped (audience is a projection, not a gate). */
  private async resolveAudience(
    jurisdictionId: string,
    rules: { appliesToRegion?: unknown; appliesToDistrictIds?: string[] },
    asOf: Date,
  ): Promise<{ districtSlug: string; revisionId: string }[]> {
    const slugs = new Set<string>();
    const explicit = new Map<string, string>(); // slug → revision id named directly

    for (const entry of rules.appliesToDistrictIds ?? []) {
      const m = /^(.+)-(\d{4})$/.exec(entry);
      if (m && (await this.d.geoStore.districtExists(entry))) {
        explicit.set(m[1]!, entry);
      } else {
        slugs.add(entry);
      }
    }
    collectDistrictSlugs(rules.appliesToRegion, slugs);

    const rows: { districtSlug: string; revisionId: string }[] = [];
    for (const [slug, revisionId] of explicit) rows.push({ districtSlug: slug, revisionId });
    for (const slug of slugs) {
      if (explicit.has(slug)) continue;
      const revisionId = await this.d.geoStore.districtIdBySlugAsOf(jurisdictionId, slug, asOf);
      if (!revisionId) {
        throw new ServiceError("validation", `unknown district ${slug} in jurisdiction ${jurisdictionId}`);
      }
      rows.push({ districtSlug: slug, revisionId });
    }
    return rows;
  }
}

/** Pull the stable seat slugs out of a RegionRef tree's base `district:<slug>` refs. */
function collectDistrictSlugs(ref: unknown, into: Set<string>): void {
  if (typeof ref === "string") {
    if (ref.startsWith("district:")) into.add(ref.slice("district:".length));
    return;
  }
  if (ref && typeof ref === "object" && "refs" in ref && Array.isArray((ref as { refs: unknown[] }).refs)) {
    for (const child of (ref as { refs: unknown[] }).refs) collectDistrictSlugs(child, into);
  }
}

function hexPubkey(value: string, field: string): string {
  const v = value?.trim().toLowerCase();
  if (!v || !PUBKEY_HEX.test(v)) {
    throw new ServiceError("validation", `${field} must be a SEC1 P-256 public key in hex`);
  }
  return v;
}

function nonEmpty(value: string, field: string): string {
  const v = value?.trim();
  if (!v) throw new ServiceError("validation", `${field} is required`);
  return v;
}

function validateIntent(intent: Intent): void {
  if (!intent || typeof intent !== "object") throw new ServiceError("validation", "intent is required");
  if (!OPS.has(intent.op as Op)) throw new ServiceError("validation", "intent.op must be create, update, or delete");
  if (!RECORD_TYPES.has(intent.type as RecordType)) {
    throw new ServiceError("validation", "intent.type is not a supported civic record type");
  }
  if (!intent.entityId || typeof intent.entityId !== "string") {
    throw new ServiceError("validation", "intent.entityId is required");
  }
  if (!opAllowed(intent.type as RecordType, intent.op as Op)) {
    throw new ServiceError("validation", `op '${intent.op}' is not allowed on a '${intent.type}'`);
  }
}

/** Map a non-ServiceError thrown by the reused libraries to a ServiceError, preserving its message
 *  (envelope/binding validation messages carry no secrets). A ServiceError passes through unchanged. */
function asServiceError(err: unknown, fallbackCode: "validation"): ServiceError {
  if (err instanceof ServiceError) return err;
  const message = err instanceof Error ? err.message : "civic write failed";
  return new ServiceError(fallbackCode, message);
}
