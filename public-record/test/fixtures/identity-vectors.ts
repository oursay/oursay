// Frozen deterministic identity vectors (promoted from passkey-test/src/vectors.ts).
//
// IMPORTANT — intentional divergence from the spike: the envelope `signature`/`txHash` vectors are
// recomputed for the PRODUCTION envelope shape, where `contentHash = contentCommitment({ id: txId,
// … })` (RecordService convention) rather than the spike's `id = ENTITY_ID`. The pure `threadPubkey`
// (derive) and `commitment` (threadCommitment) vectors are identical to the spike's. Regenerate with
// `npx tsx scripts/compute-identity-vectors.ts`.

import { hexToBytes } from "@noble/hashes/utils";
import { contentCommitment } from "../../src/crypto/commitment.js";
import type { TxEnvelope } from "../../src/schema/types.js";

// ── Fixed derivation inputs ───────────────────────────────────────────────────────────────
export const LEVEL_MASTER_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
export const levelMaster = (): Uint8Array => hexToBytes(LEVEL_MASTER_HEX);

export const USER_ID = "user-alice";
export const THREAD_ID = "thread-belief-42";
export const LEVEL = "federal";
/** Fixed 32-byte salt_t (hex) for deterministic commitment/binding vectors. */
export const SALT_T_HEX = "a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf".replace(/\s/g, "");

// A second thread/level to prove domain separation (must yield a DIFFERENT key).
export const THREAD_ID_2 = "thread-belief-99";
export const LEVEL_2 = "provincial";

// ── Fixed envelope fixture (a `post` create) — PRODUCTION shape (contentHash id = txId) ─────
export const TX_ID = "11111111-1111-4111-8111-111111111111";
export const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
export const CONTENT_SALT = "ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
export const CONTENT = { title: "Protected bike lanes on Main St.", body: "I support adding protected bike lanes." };

/** contentHash binds to the txId (matches RecordService.append). */
export const CONTENT_HASH = contentCommitment({ id: TX_ID, salt: CONTENT_SALT, content: CONTENT });

/** Unsigned envelope template; signEnvelope() fills authorPubkey + signature. */
export function envFixture(): TxEnvelope {
  return {
    v: 1,
    txId: TX_ID,
    type: "post",
    entityId: ENTITY_ID,
    op: "create",
    authorPubkey: "",
    signature: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    prevHash: null,
    contentHash: CONTENT_HASH,
  };
}

// ── Frozen expected outputs (filled by scripts/compute-identity-vectors.ts) ─────────────────
export const EXPECT = {
  contentHash: "83aa35b392d573c99ccf37eb0833b8416cbf47d44f73deefb249daf24292a6c9",
  // threadPubkey + commitment are identical to the passkey-test spike (derivation is unchanged).
  threadPubkey: "0323a8ea4ff23736e96bcad3afefdc30475d06e18b780648af011c2d9fc46d61af",
  commitment: "1076a12c3938dd82d72ee457cc13b56d2c0648d5b6c62b2679be6beb91cc1a33",
  // signature + txHash differ from the spike: production envelope uses contentHash id = txId.
  signature:
    "420bc3f408e8b4a83ecb3f133aa1dcec8abd232e71980a71eb8e08dc86f5166d500a4aa00d3038a8aa8ad55cf713506c3f8742f9c5e16221dd6b650f509c62e2",
  txHash: "aacd5825a0effab00ef35ac08c3b2df566db86844620d569c72efc7bb029c7d6",
} as const;
