// Q3 — on-device per-thread key derivation (public-record PROPOSAL.md §6).
//
// A user holds one LEVEL MASTER per governmental level (the 32-byte IKM; on the web it comes from
// the WebAuthn PRF output, or the secure-storage fallback — see FINDINGS). Per-thread keys are
// derived deterministically with HKDF-SHA256, DOMAIN-SEPARATED by (thread_id, level), then mapped
// to a P-256 private scalar. No private/derivation material ever leaves the device; the platform
// only ever sees the public thread key.

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/abstract/utils";

/** Fixed application salt for HKDF (separates this KDF use from any other in the protocol). */
const DERIVE_SALT = utf8ToBytes("oursay/v1/thread-derive");

/** HKDF `info` = the domain separation §6 requires: distinct per (thread_id, level). */
export function threadDomainInfo(threadId: string, level: string): Uint8Array {
  return utf8ToBytes(`oursay/v1/thread-key|level=${level}|thread=${threadId}`);
}

export interface DeriveInput {
  /** 32-byte level master (HKDF IKM). */
  levelMaster: Uint8Array;
  threadId: string;
  level: string;
}

/**
 * Derive the per-thread P-256 private key.
 *
 * Scalar mapping (PINNED for reproducibility — see vectors.ts): HKDF-Expand to 48 bytes (oversized
 * so the modulo bias is < 2^-128), interpret big-endian as `x`, then `scalar = (x mod (n-1)) + 1`,
 * which lands strictly in [1, n-1]. Encode the scalar big-endian into 32 bytes.
 */
export function deriveThreadPrivateKey(input: DeriveInput): Uint8Array {
  const okm = hkdf(sha256, input.levelMaster, DERIVE_SALT, threadDomainInfo(input.threadId, input.level), 48);
  const n = p256.CURVE.n;
  const scalar = (bytesToNumberBE(okm) % (n - 1n)) + 1n;
  return numberToBytesBE(scalar, 32);
}

export interface ThreadKey {
  privKey: Uint8Array;
  /** Compressed SEC1 public key (hex) — the public thread identity in the envelope. */
  threadPubkey: string;
}

export function deriveThreadKey(input: DeriveInput): ThreadKey {
  const privKey = deriveThreadPrivateKey(input);
  return { privKey, threadPubkey: bytesToHex(p256.getPublicKey(privKey)) };
}
