// On-device, thread-scoped DEVICE signing keys (Identity & Device Policy §5.4, Method 3).
//
// Method 3 separates three layers: the verified human, the THREAD PERSONA `Pₜ` (the stable public
// author id per (user, thread)), and the DEVICE KEY `Dᵢ` that actually signs an envelope. A user
// may enrol several hardware-backed devices; any of them may act for the persona.
//
// To stay publicly verifiable (§5.1) WITHOUT leaking a cross-thread correlator (§5.3, Method 5
// ruled out), the signer that appears on the public envelope must be THREAD-SCOPED: each device
// derives a distinct signer key per (device, thread). The same physical device therefore shows an
// unrelated `signerPubkey` in every thread — no observer can link a person across threads from it.
// The device→user link is kept only in the PRIVATE registry (device_keys / thread_signers), never
// on the record. When device signing is used the persona's private key never signs — `authorPubkey`
// is a public label, and authorization flows through the signer's private enrollment binding.
//
// The DEVICE ROOT here mirrors the jurisdiction master in `derive.ts`: a 32-byte secret held on the
// device (passkey PRF output or a non-exportable secure-storage key), distinct per device. It never
// leaves the device; the platform only ever sees the public signer key.

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/abstract/utils";
import { signingDigest, UNSIGNED } from "./envelope.js";
import { txHashOf } from "../ledger/chain.js";
import type { SignResult } from "./envelope.js";
import type { TxEnvelope } from "../schema/types.js";

/** Fixed application salt for the device-signer KDF — distinct from `oursay/v1/thread-derive`. */
const DEVICE_DERIVE_SALT = utf8ToBytes("oursay/v1/device-signer-derive");

/** HKDF `info` for a thread-scoped device signer: distinct per (thread_id, jurisdiction). */
export function deviceSignerDomainInfo(threadId: string, jurisdiction: string): Uint8Array {
  return utf8ToBytes(`oursay/v1/device-signer|jurisdiction=${jurisdiction}|thread=${threadId}`);
}

export interface DeriveDeviceSignerInput {
  /** 32-byte device root (HKDF IKM) — one per enrolled device, on-device only. */
  deviceRoot: Uint8Array;
  threadId: string;
  jurisdiction: string;
}

export interface DeviceThreadSigner {
  privKey: Uint8Array;
  /** Compressed SEC1 public key (hex) — the thread-scoped signer published in the envelope. */
  signerPubkey: string;
}

/**
 * Derive a thread-scoped device signer P-256 key. Same scalar mapping as `deriveThreadPrivateKey`
 * (HKDF-Expand to 48 bytes so modulo bias < 2^-128; `scalar = (x mod (n-1)) + 1` in [1, n-1]),
 * domain-separated by (thread_id, jurisdiction) AND by the device root — so each (device, thread)
 * yields a distinct, cross-thread-unlinkable key.
 */
export function deriveDeviceThreadSigner(input: DeriveDeviceSignerInput): DeviceThreadSigner {
  const okm = hkdf(sha256, input.deviceRoot, DEVICE_DERIVE_SALT, deviceSignerDomainInfo(input.threadId, input.jurisdiction), 48);
  const n = p256.CURVE.n;
  const scalar = (bytesToNumberBE(okm) % (n - 1n)) + 1n;
  const privKey = numberToBytesBE(scalar, 32);
  return { privKey, signerPubkey: bytesToHex(p256.getPublicKey(privKey)) };
}

/**
 * Sign an envelope with a thread-scoped DEVICE key while attributing it to the thread persona.
 * Sets `authorPubkey = personaPubkey` (the public author id) and `signerPubkey` to the device key,
 * signs the signing digest (deterministic ECDSA / RFC-6979, low-S) with the device key, and returns
 * the leaf via the reused `txHashOf`. The persona's private key is NOT needed — authorization is the
 * platform's job (the signer must map to the same verified user as the persona, see appendSigned).
 */
export function signEnvelopeWithDevice(
  env: TxEnvelope,
  deviceSignerPrivKey: Uint8Array,
  personaPubkey: string,
): SignResult {
  const signerPubkey = bytesToHex(p256.getPublicKey(deviceSignerPrivKey));
  const base: TxEnvelope = { ...env, authorPubkey: personaPubkey, signerPubkey, signature: UNSIGNED };
  const sig = p256.sign(signingDigest(base), deviceSignerPrivKey);
  const envelope: TxEnvelope = { ...base, signature: bytesToHex(sig.toCompactRawBytes()) };
  return { envelope, txHash: txHashOf(envelope) };
}
