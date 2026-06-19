// Per-parent nullifier derivation (PROPOSAL §6 / signed-write-path plan). On-device, deterministic.
//
// A nullifier is a privacy-preserving "one per (user, parent)" tag for singleton actions
// (vote / petition_signature / reaction). It is derived from a per-level NULLIFIER SECRET (itself
// HKDF'd from the level master, domain-separated from thread-key derivation) and the singleton
// PARENT id. Properties: deterministic per (user, level, parent); unlinkable across parents and
// across levels (different externalNullifier / different secret); reveals nothing about identity.
// The platform attests one nullifier per (user, parent) at first use (platform-attested tier);
// a future zk-membership proof fills this same slot to make it trustless.

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/** Separates the nullifier secret from the thread-key derivation (which uses oursay/v1/thread-derive). */
const NULLIFIER_SECRET_SALT = utf8ToBytes("oursay/v1/nullifier-secret");
/** Separates nullifier evaluation from secret derivation. */
const NULLIFIER_EVAL_SALT = utf8ToBytes("oursay/v1/nullifier-eval");

/** The per-level nullifier secret (32 bytes), HKDF'd from the level master. Stays on-device. */
export function deriveNullifierSecret(levelMaster: Uint8Array, level: string): Uint8Array {
  return hkdf(sha256, levelMaster, NULLIFIER_SECRET_SALT, utf8ToBytes(`level=${level}`), 32);
}

/** The nullifier (hex) for a singleton action on `parentId` — a PRF of the secret over the parent. */
export function threadNullifier(nullifierSecret: Uint8Array, parentId: string): string {
  return bytesToHex(hkdf(sha256, nullifierSecret, NULLIFIER_EVAL_SALT, utf8ToBytes(`parent=${parentId}`), 32));
}
