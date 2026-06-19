// Platform-side signing/verification of a per-thread registration binding (§6).
//
// At thread registration the PLATFORM signs the public binding (thread_pubkey, thread_id, level,
// kyc_tier, region?, commitment) with its P-256 key. The signature is stored privately in
// `thread_bindings.binding_sig` and re-verified on every verified-tier append (defense-in-depth).
// The platform key is provided by the caller (env-required in prod, ephemeral in tests) — this
// module never reads config so it stays pure/testable. KMS-managed keys are a later milestone.

import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalJson } from "../crypto/commitment.js";
import type { ThreadBindingPublic } from "./binding.js";

/** The digest the platform signs: sha256(canonicalJson(binding)). Canonical JSON sorts keys, so
 *  presence/absence of optional fields (kyc_tier always set; region only when provided) is what
 *  matters — reconstruct the binding identically when verifying. */
export function bindingDigest(binding: ThreadBindingPublic): Uint8Array {
  return sha256(utf8ToBytes(canonicalJson(binding)));
}

/** The platform's compressed SEC1 public key (hex) for a given private key (hex). */
export function platformPublicKey(platformPrivKeyHex: string): string {
  return bytesToHex(p256.getPublicKey(hexToBytes(platformPrivKeyHex)));
}

export function signBinding(binding: ThreadBindingPublic, platformPrivKeyHex: string): string {
  if (!platformPrivKeyHex) throw new Error("platform binding private key not configured");
  const sig = p256.sign(bindingDigest(binding), hexToBytes(platformPrivKeyHex));
  return bytesToHex(sig.toCompactRawBytes());
}

export function verifyBinding(binding: ThreadBindingPublic, sigHex: string, platformPubKeyHex: string): boolean {
  if (!sigHex || !platformPubKeyHex) return false;
  try {
    return p256.verify(hexToBytes(sigHex), bindingDigest(binding), hexToBytes(platformPubKeyHex));
  } catch {
    return false;
  }
}
