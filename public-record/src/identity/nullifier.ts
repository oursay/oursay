// Per-parent nullifier derivation (PROPOSAL §6 / Identity & Device Policy §5.4). On-device, deterministic.
//
// A nullifier is a privacy-preserving "one per (user, parent)" tag for singleton actions
// (vote / petition_signature / reaction). It is derived from a per-JURISDICTION NULLIFIER SECRET and
// the singleton PARENT id. Properties: deterministic per (user, jurisdiction, parent); unlinkable
// across parents and ACROSS JURISDICTIONS (different secret); reveals nothing about identity. Keying
// the secret by jurisdiction — not by governmental level — is what lets a user act once PER
// JURISDICTION: two jurisdictions at the same level (e.g. ab-ca-gov and bc-ca-gov) get independent
// secrets, so a vote in one neither dedupes against nor links to a vote in the other.
//
// Method 3 (§5.4 "sacrifices"): the nullifier secret is rooted in a per-(user, jurisdiction)
// nullifier root — provisioned once at verification and shared across the user's devices (passkey
// PRF, or a user-controlled encrypted backup) — NOT an independent per-device root. This is what
// lets every one of a user's devices reproduce the SAME nullifier, so a vote cast on one phone can
// be changed from another (the singleton edit carries the original nullifier forward). Even so, the
// platform's `nullifier_attestations` table (PK (user_id, parent_id)) remains the AUTHORITATIVE
// one-per-user backstop, so dedupe holds even if a device computed a divergent value. A future
// Method-4 (§5.5) zk-membership proof fills this same slot to make dedupe trustless.

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/** Separates the nullifier secret from the thread-key derivation (which uses oursay/v1/thread-derive). */
const NULLIFIER_SECRET_SALT = utf8ToBytes("oursay/v1/nullifier-secret");
/** Separates nullifier evaluation from secret derivation. */
const NULLIFIER_EVAL_SALT = utf8ToBytes("oursay/v1/nullifier-eval");

/**
 * The per-JURISDICTION nullifier secret (32 bytes), HKDF'd from the user's per-jurisdiction nullifier
 * root. Stays on-device, and (per §5.4) must be reproducible on every device the user enrols — so the
 * root is a user secret shared across devices, not a per-device root. Domain-separated by jurisdiction
 * so singleton dedupe is scoped per jurisdiction, never across them.
 */
export function deriveNullifierSecret(userNullifierRoot: Uint8Array, jurisdiction: string): Uint8Array {
  return hkdf(sha256, userNullifierRoot, NULLIFIER_SECRET_SALT, utf8ToBytes(`jurisdiction=${jurisdiction}`), 32);
}

/** The nullifier (hex) for a singleton action on `parentId` — a PRF of the secret over the parent. */
export function threadNullifier(nullifierSecret: Uint8Array, parentId: string): string {
  return bytesToHex(hkdf(sha256, nullifierSecret, NULLIFIER_EVAL_SALT, utf8ToBytes(`parent=${parentId}`), 32));
}
