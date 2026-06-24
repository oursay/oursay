// P-256 signing/verification of a canonical TxEnvelope (PROPOSAL.md §6). Promoted from `passkey-test`.
//
// Two distinct hashes (this is the crux):
//   1. SIGNING DIGEST — sha256(canonicalJson(envelope)) with `signature` blanked to "" (you cannot
//      sign over your own signature) and `authorPubkey` already set to the thread pubkey.
//   2. LEAF / CHAIN HASH — txHashOf(fullEnvelope), REUSED from the ledger: hashLeaf over the canonical
//      FULL envelope INCLUDING the populated signature. This is the per-entity chain link / Merkle
//      leaf, computed AFTER signing. We reuse txHashOf rather than re-implement it.
//
// This module is browser-safe: it imports txHashOf from the pure leaf module ../crypto/txhash.js (not
// ../ledger/chain.js), so it carries no config/dotenv/node dependency and bundles for the browser.

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { canonicalJson } from "../crypto/commitment.js";
import { txHashOf } from "../crypto/txhash.js";
import { verifyWebauthnAssertion } from "./webauthn.js";
import type { TxEnvelope } from "../schema/types.js";

/** The placeholder the `signature` field holds while computing the signing digest. */
export const UNSIGNED = "";

/**
 * sha256(canonicalJson(envelope with `signature` AND `webauthn` blanked)) — the bytes the signing key
 * signs, and (on the WebAuthn path) the assertion CHALLENGE. `webauthn` is produced BY the act of
 * signing (like `signature`), so it is excluded here; `signScheme`/`authorPubkey` are set BEFORE
 * signing, so they ARE covered. `canonicalJson` drops `undefined`, so a p256 envelope (no `webauthn`)
 * hashes byte-identically to before this field existed.
 */
export function signingDigest(env: TxEnvelope): Uint8Array {
  const base: TxEnvelope = { ...env, signature: UNSIGNED, webauthn: undefined };
  return sha256(utf8ToBytes(canonicalJson(base)));
}

export interface SignResult {
  /** The fully populated envelope (authorPubkey + signature set). */
  envelope: TxEnvelope;
  /** The leaf / chain hash, via the ledger's txHashOf (full envelope incl. signature). */
  txHash: string;
}

/**
 * Sign an envelope with a derived per-thread P-256 key. Sets `authorPubkey` to the thread pubkey,
 * signs the signing-digest (deterministic ECDSA / RFC-6979, low-S), sets `signature`, and returns
 * the leaf via the reused `txHashOf`.
 */
export function signEnvelope(env: TxEnvelope, privKey: Uint8Array): SignResult {
  const threadPubkey = bytesToHex(p256.getPublicKey(privKey));
  const base: TxEnvelope = { ...env, authorPubkey: threadPubkey, signature: UNSIGNED };
  const sig = p256.sign(signingDigest(base), privKey);
  const envelope: TxEnvelope = { ...base, signature: bytesToHex(sig.toCompactRawBytes()) };
  return { envelope, txHash: txHashOf(envelope) };
}

/**
 * Verify an envelope's signature, branching on `signScheme` (absent ⇒ "p256"):
 *   - `webauthn-es256`: a per-thread WebAuthn passkey assertion verified against `authorPubkey`
 *     (see {@link verifyWebauthnAssertion}); the top-level `signature` is "".
 *   - `p256`: a derived key signed the digest — the thread-scoped `signerPubkey` (device key) when
 *     present, otherwise `authorPubkey` (persona signed). Either way the digest binds the whole
 *     envelope (incl. `authorPubkey`/`signerPubkey`), so neither can be swapped post-signature.
 */
export function verifyEnvelope(env: TxEnvelope): boolean {
  if ((env.signScheme ?? "p256") === "webauthn-es256") return verifyWebauthnAssertion(env);
  if (!env.signature || env.signature === UNSIGNED) return false;
  try {
    const verifyingKey = env.signerPubkey ?? env.authorPubkey;
    return p256.verify(hexToBytes(env.signature), signingDigest(env), hexToBytes(verifyingKey));
  } catch {
    return false;
  }
}
