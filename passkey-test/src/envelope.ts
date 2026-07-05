// Q3 — P-256 signing of a canonical TxEnvelope, aligned with public-record.
//
// Two distinct hashes (this is the crux):
//   1. SIGNING DIGEST — sha256(canonicalJson(envelope)) with `signature` blanked to "" (you cannot
//      sign over your own signature) and `authorPubkey` already set to the thread pubkey.
//   2. LEAF / CHAIN HASH — txHashOf(fullEnvelope), REUSED from public-record: hashLeaf over the
//      canonical FULL envelope INCLUDING the populated signature. This is the per-entity chain link
//      / Merkle leaf, computed AFTER signing. We import txHashOf rather than re-implement it.

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { canonicalJson } from "@oursay/public-record/crypto/commitment";
import { txHashOf } from "@oursay/public-record/ledger/chain";
import type { TxEnvelope } from "@oursay/public-record/schema/types";

/** The placeholder the `signature` field holds while computing the signing digest. */
export const UNSIGNED = "";

/** sha256(canonicalJson(envelope with signature="")) — the bytes the per-thread key signs. */
function signingDigest(env: TxEnvelope): Uint8Array {
  const base: TxEnvelope = { ...env, signature: UNSIGNED };
  return sha256(utf8ToBytes(canonicalJson(base)));
}

export interface SignResult {
  /** The fully populated envelope (authorPubkey + signature set). */
  envelope: TxEnvelope;
  /** The leaf / chain hash, via public-record's txHashOf (full envelope incl. signature). */
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

/** Verify an envelope's per-thread signature against its `authorPubkey`. */
export function verifyEnvelope(env: TxEnvelope): boolean {
  if (!env.signature || env.signature === UNSIGNED) return false;
  try {
    return p256.verify(hexToBytes(env.signature), signingDigest(env), hexToBytes(env.authorPubkey));
  } catch {
    return false;
  }
}
