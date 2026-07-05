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
export const JURISDICTION_MASTER_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
export const jurisdictionMaster = (): Uint8Array => hexToBytes(JURISDICTION_MASTER_HEX);

export const USER_ID = "user-alice";
export const THREAD_ID = "thread-belief-42";
export const JURISDICTION = "ab-ca-gov";
/** Fixed 32-byte salt_t (hex) for deterministic commitment/binding vectors. */
export const SALT_T_HEX = "a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf".replace(/\s/g, "");

// A second thread/jurisdiction to prove domain separation (must yield a DIFFERENT key).
export const THREAD_ID_2 = "thread-belief-99";
export const JURISDICTION_2 = "ca-gov";

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
  // Keyed by JURISDICTION (re-keyed from the old per-level vectors). Regenerate with the script.
  threadPubkey: "02634c2562aac67c92ae69022bf8cf845d5227fd3661d8bcc3af03edc7b7f50cb8",
  commitment: "9deaf01089a8f43d3f41a784a5b9f39eb68f057fd36e88dc2105a6f2fedd66f3",
  signature:
    "a5a0ba328b20cd2709038e3724ef0284aceaa93715f8731772ef29eff99e411dc02c36a59b59cef83abcc1b3dcddd9176df62adc918e8e76a5ac9e39989f6490",
  txHash: "036e00a7fddedbced4a68e758b50dcbd71b52f059f1e446151662ede90fa035a",
} as const;
