// Shared DTOs for the client↔server identity boundary. Everything that crosses from client to
// server is PUBLIC material (pubkeys, the opaque commitment, signed envelopes) — never a private
// root, salt opening, or device-private key. @oursay/api serializes these over HTTP.

import type { Op, RecordType, TxEnvelope } from "@oursay/public-record/schema/types";

/** A thread = a root entity (post/poll/petition) within a JURISDICTION (the identity partition). */
export interface ThreadRef {
  /** The root entity id this thread is scoped to (the persona/signer derivation scope). */
  threadId: string;
  /** The jurisdiction id this thread belongs to (e.g. `ab-ca-gov`); the crypto partition key. */
  jurisdiction: string;
}

export interface ParentRef {
  type: RecordType;
  id: string;
}

/** A create intent (root or attachment). `entityId` is caller-chosen so client + server agree. */
export interface CreateIntent {
  op: "create";
  type: RecordType;
  entityId: string;
  parent?: ParentRef;
  content: unknown;
}

/** An update/delete intent against an existing entity. `content` is ignored for deletes. */
export interface MutateIntent {
  op: "update" | "delete";
  type: RecordType;
  entityId: string;
  content?: unknown;
}

export type Intent = CreateIntent | MutateIntent;

/** The server-derived fields a client must sign over — mirrors RecordService.prepareAppend. */
export interface PreparedAppend {
  prevHash: string | null;
  parentType?: RecordType;
  parentId?: string;
  parentRevisionHash?: string;
  parentRevisionTxId?: string;
  rootEntityId: string;
  nullifierParentId?: string;
  nullifier?: string;
}

/** A client-built, device-signed submission ready for the server's `submit`. */
export interface SignedSubmission {
  envelope: TxEnvelope;
  salt: string;
  content: unknown;
}

/** Client → server: enrol a device's account-level public key (becomes a `device_keys` row). */
export interface DeviceEnrollment {
  userId: string;
  devicePubkey: string;
  label?: string;
}

/**
 * Client → server: join a thread (mvp-a5b persona/signer split, docs/08 §5.4 rule 6). The caller
 * sends THIS device's per-thread WebAuthn passkey pubkey as `signerPubkey`; the server is the
 * authority on whether it becomes Pₜ (first join wins) or is enrolled as an additional signer
 * under an existing Pₜ for `(user, thread)`. Only PUBLIC material crosses the wire (the device
 * pubkey + opaque commitment; the opening stays client-side until selective reveal).
 *
 * Server behaviour:
 *   • First join for `(user, thread)` — `signerPubkey` is adopted as Pₜ, the platform binding row
 *     is minted under it, and a `thread_civic_credentials` row is written for this signer.
 *   • Subsequent join — Pₜ already exists; the incoming `commitment` must match the bound one
 *     (a different opening is rejected); a new `thread_civic_credentials` row is written for the
 *     new device's signer under that same Pₜ.
 * Response always returns the canonical Pₜ as `personaPubkey` (the envelope's `authorPubkey`).
 *
 * A join proves account↔thread-persona OWNERSHIP only. `kycTier` is OPTIONAL and not part of the
 * HTTP join path: verification tier and district membership are applied at read/count time, not
 * fixed at registration. Omit it to bind ownership without a tier.
 */
export interface ThreadRegistration {
  userId: string;
  threadId: string;
  jurisdiction: string;
  /** This device's per-thread WebAuthn passkey pubkey (envelope `signerPubkey`). */
  signerPubkey: string;
  commitment: string;
  kycTier?: string;
}

/** Server → client response from `joinThread`. Always carries the canonical thread persona Pₜ. */
export interface JoinThreadResponse {
  /** Stable thread persona pubkey Pₜ for this `(user, thread)` — the envelope's `authorPubkey`. */
  personaPubkey: string;
}

export type { Op, RecordType, TxEnvelope };
