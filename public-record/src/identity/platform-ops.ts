// Clear-message signing for platform-ops admin attestations + helpers to build platform-signed
// envelopes. Admin signs a domain-separated request (NOT a TxEnvelope); the platform then signs the
// envelope as author. Reuses PLATFORM_BINDING_PRIVKEY by default (documented blast radius — a future
// PLATFORM_OPS_PRIVKEY can split purpose). Mirror the pure style of platform-binding.ts.

import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalJson, contentCommitment, newSalt } from "../crypto/commitment.js";
import { signEnvelope } from "./envelope.js";
import { buildWebauthnAssertion, verifyWebauthnAssertionForChallenge } from "./webauthn.js";
import type {
  PlatformOpsAdminAttestation,
  PlatformOpsContent,
  PlatformOpsKind,
  PlatformOpsRequest,
  TxEnvelope,
  WebauthnAssertion,
} from "../schema/types.js";
import { platformPublicKey } from "./platform-binding.js";

/**
 * Deterministic UUID for a seat-scoped platform-ops entity (`record_tx.entity_id` is UUID).
 * sha256(`oursay/v1/platform-ops/seat/<handle>`) → UUID-shaped bits (version/variant set).
 */
export function platformOpsSeatEntityId(seatHandle: string): string {
  const norm = seatHandle.replace(/^@/, "").trim().toLowerCase();
  const digest = sha256(utf8ToBytes(`oursay/v1/platform-ops/seat/${norm}`));
  digest[6] = (digest[6]! & 0x0f) | 0x40;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const h = bytesToHex(digest.slice(0, 16));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** sha256(canonicalJson(request)) — the bytes an admin p256-signs (or WebAuthn challenge). */
export function platformOpsRequestDigest(request: PlatformOpsRequest): Uint8Array {
  return sha256(utf8ToBytes(canonicalJson(request)));
}

export function platformOpsRequestHash(request: PlatformOpsRequest): string {
  return bytesToHex(platformOpsRequestDigest(request));
}

export function signPlatformOpsRequestP256(request: PlatformOpsRequest, privKeyHex: string): string {
  const sig = p256.sign(platformOpsRequestDigest(request), hexToBytes(privKeyHex));
  return bytesToHex(sig.toBytes('compact'));
}

export function verifyPlatformOpsRequestP256(
  request: PlatformOpsRequest,
  sigHex: string,
  pubKeyHex: string,
): boolean {
  if (!sigHex || !pubKeyHex) return false;
  try {
    return p256.verify(hexToBytes(sigHex), platformOpsRequestDigest(request), hexToBytes(pubKeyHex));
  } catch {
    return false;
  }
}

/** Verify an admin attestation over the exact clear request (p256 or webauthn-es256). */
export function verifyPlatformOpsAdminAttestation(
  request: PlatformOpsRequest,
  attestation: PlatformOpsAdminAttestation,
): boolean {
  const expectedHash = platformOpsRequestHash(request);
  if (attestation.requestHash !== expectedHash) return false;
  const digest = platformOpsRequestDigest(request);
  if (attestation.signScheme === "webauthn-es256") {
    if (!attestation.webauthn || !attestation.signerPubkey) return false;
    return verifyWebauthnAssertionForChallenge(attestation.webauthn, digest, attestation.signerPubkey);
  }
  if (attestation.webauthn) return false;
  return verifyPlatformOpsRequestP256(request, attestation.signature, attestation.signerPubkey);
}

export function buildPlatformOpsRequest(input: {
  requestId: string;
  kind: PlatformOpsKind;
  jurisdictionId: string;
  payload: Record<string, unknown>;
  createdAt?: string;
}): PlatformOpsRequest {
  return {
    ds: "oursay/v1/platform-ops-request",
    v: 1,
    requestId: input.requestId,
    kind: input.kind,
    jurisdictionId: input.jurisdictionId,
    payload: input.payload,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function buildPlatformOpsAdminAttestationP256(input: {
  request: PlatformOpsRequest;
  privKeyHex: string;
  signedAt?: string;
}): PlatformOpsAdminAttestation {
  const signerPubkey = platformPublicKey(input.privKeyHex);
  return {
    signerPubkey,
    signScheme: "p256",
    signature: signPlatformOpsRequestP256(input.request, input.privKeyHex),
    signedAt: input.signedAt ?? new Date().toISOString(),
    requestHash: platformOpsRequestHash(input.request),
  };
}

/** Test/dev helper: WebAuthn assertion whose challenge is the clear-request digest. */
export function buildPlatformOpsAdminAttestationWebauthn(input: {
  request: PlatformOpsRequest;
  credentialPriv: Uint8Array;
  rpId: string;
  origin: string;
  signerPubkey: string;
  signedAt?: string;
}): PlatformOpsAdminAttestation {
  const challenge = platformOpsRequestDigest(input.request);
  const webauthn: WebauthnAssertion = buildWebauthnAssertion({
    credentialPriv: input.credentialPriv,
    rpId: input.rpId,
    origin: input.origin,
    challenge,
  });
  return {
    signerPubkey: input.signerPubkey,
    signScheme: "webauthn-es256",
    signature: "",
    webauthn,
    signedAt: input.signedAt ?? new Date().toISOString(),
    requestHash: platformOpsRequestHash(input.request),
  };
}

export function buildPlatformOpsContent(input: {
  request: PlatformOpsRequest;
  adminAttestation: PlatformOpsAdminAttestation;
}): PlatformOpsContent {
  return {
    ds: "oursay/v1/platform-ops",
    v: 1,
    kind: input.request.kind,
    jurisdictionId: input.request.jurisdictionId,
    payload: input.request.payload,
    adminAttestation: input.adminAttestation,
    request: input.request,
  };
}

/** Resolve a stable entity id for the kind (seat ops share one entity per handle). */
export function platformOpsEntityId(kind: PlatformOpsKind, payload: Record<string, unknown>): string {
  if (kind === "official_seat_claim" || kind === "official_seat_revoke") {
    const handle = typeof payload.seatHandle === "string" ? payload.seatHandle : "";
    if (!handle) throw new Error("platform_ops seat kind requires payload.seatHandle");
    return platformOpsSeatEntityId(handle);
  }
  throw new Error(`platform_ops: unsupported kind ${kind}`);
}

/**
 * Build + platform-sign a platform_ops envelope. Returns the signed envelope + salt + content for
 * {@link RecordService.appendPlatformOps}.
 */
export function buildAndSignPlatformOpsEnvelope(input: {
  platformPrivKeyHex: string;
  content: PlatformOpsContent;
  entityId: string;
  op?: "create" | "update";
  prevHash: string | null;
  salt?: string;
  txId?: string;
  createdAt?: string;
}): { envelope: TxEnvelope; salt: string; content: PlatformOpsContent; txId: string } {
  const op = input.op ?? (input.prevHash === null ? "create" : "update");
  const txId = input.txId ?? cryptoRandomUuid();
  const salt = input.salt ?? newSalt();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const authorPubkey = platformPublicKey(input.platformPrivKeyHex);
  const base: TxEnvelope = {
    v: 1,
    txId,
    type: "platform_ops",
    entityId: input.entityId,
    op,
    authorPubkey: "",
    signature: "",
    signScheme: "p256",
    createdAt,
    prevHash: input.prevHash,
    contentHash: contentCommitment({ id: txId, salt, content: input.content }),
  };
  const { envelope } = signEnvelope(base, hexToBytes(input.platformPrivKeyHex));
  if (envelope.authorPubkey !== authorPubkey) {
    throw new Error("platform_ops: signed authorPubkey mismatch");
  }
  return { envelope, salt, content: input.content, txId };
}

/** Prefer globalThis.crypto in modern Node/browsers. */
function cryptoRandomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const b = p256.utils.randomSecretKey().slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
