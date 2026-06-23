// CivicRecordService: the authenticated civic WRITE path (docs/08 §6; public-record R1/R2/R7). Thin
// orchestration over @oursay/identity/server's IdentityRegistry — it owns NO crypto. Three operations:
//   - join:    bind account↔thread-key ownership (platform-signed binding + thread signer). No KYC
//              tier is fixed at join; verification tier is applied at read/count time.
//   - prepare: compute the server-derived fields a client must sign over for one civic intent.
//   - submit:  accept a client+device-signed envelope into the verified record pool.
// Auth/ownership lives here so HTTP routes stay thin: the caller's userId (from the session) must own
// the device, persona, and signer involved. The RecordService underneath is the verified path
// (requireDeviceSigner) — a persona-only/unsigned envelope is rejected.

import type { IdentityRegistry } from "@oursay/identity/server";
import type { Intent, PreparedAppend, SignedSubmission } from "@oursay/identity";
import { opAllowed } from "@oursay/public-record";
import type { Op, PrivateStore, RecordType, Ref } from "@oursay/public-record";
import { ServiceError } from "../errors.js";

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
]);
const OPS = new Set<Op>(["create", "update", "delete"]);

export interface JoinThreadInput {
  userId: string;
  threadId: string;
  jurisdiction: string;
  personaPubkey: string;
  signerPubkey: string;
  commitment: string;
  devicePubkey: string;
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
}

export class CivicRecordService {
  constructor(private readonly d: CivicRecordServiceDeps) {}

  /**
   * Join a thread: register thread-key OWNERSHIP for the caller. Pre-checks that the enrolling civic
   * device is the caller's (enrolled, not revoked) for clean errors; the registry re-checks and
   * platform-signs the binding. No `kycTier` is accepted or stored.
   */
  async join(input: JoinThreadInput): Promise<void> {
    const personaPubkey = hexPubkey(input.personaPubkey, "personaPubkey");
    const signerPubkey = hexPubkey(input.signerPubkey, "signerPubkey");
    const devicePubkey = hexPubkey(input.devicePubkey, "devicePubkey");
    const commitment = input.commitment?.trim().toLowerCase();
    if (!commitment || !SHA256_HEX.test(commitment)) {
      throw new ServiceError("validation", "commitment must be a sha256 hex digest");
    }
    const threadId = nonEmpty(input.threadId, "threadId");
    const jurisdiction = nonEmpty(input.jurisdiction, "jurisdiction");

    const device = await this.d.store.getDeviceKeyByPubkey(devicePubkey);
    if (!device || device.revoked) {
      throw new ServiceError("not_found", "Civic device is not enrolled (or has been revoked)");
    }
    if (device.userId !== input.userId) {
      throw new ServiceError("forbidden", "That civic device belongs to another account");
    }

    try {
      await this.d.registry.joinThread({
        userId: input.userId,
        threadId,
        jurisdiction,
        personaPubkey,
        signerPubkey,
        commitment,
        devicePubkey,
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

    try {
      return await this.d.registry.prepare(input.intent, author);
    } catch (err) {
      throw asServiceError(err, "validation");
    }
  }

  /**
   * Accept a client+device-signed envelope into the verified record pool. The envelope's device signer
   * AND its author persona must both resolve to the caller; the RecordService then re-verifies the
   * envelope signature and the platform binding before pooling.
   */
  async submit(input: SubmitInput): Promise<Ref> {
    const envelope = input.submission?.envelope;
    if (!envelope || typeof envelope !== "object") {
      throw new ServiceError("validation", "submission.envelope is required");
    }
    const signerPubkey = envelope.signerPubkey;
    if (!signerPubkey) {
      throw new ServiceError("validation", "submission requires a device-signed envelope (signerPubkey)");
    }

    const signer = await this.d.store.getThreadSigner(signerPubkey);
    if (!signer || signer.revoked) {
      throw new ServiceError("forbidden", "The signing device is not registered for this thread (or is revoked)");
    }
    if (signer.userId !== input.userId) {
      throw new ServiceError("forbidden", "That thread signer belongs to another account");
    }
    const persona = await this.d.store.getThreadKey(envelope.authorPubkey);
    if (!persona || persona.userId !== input.userId) {
      throw new ServiceError("forbidden", "That author persona belongs to another account");
    }

    try {
      return await this.d.registry.submit(input.submission);
    } catch (err) {
      throw asServiceError(err, "validation");
    }
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
