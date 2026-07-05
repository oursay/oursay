// Frozen deterministic fixtures + expected outputs. These pin the EXACT derivation/signing/
// commitment methods so the suites are a regression gate: if any algorithm detail drifts (HKDF
// params, scalar mapping, canonical JSON, signature encoding), the expected hex below changes and
// the tests fail loudly. Expected values are produced by `scripts/compute-vectors.ts`.

import { hexToBytes } from "@noble/hashes/utils";
import { contentCommitment } from "@oursay/public-record/crypto/commitment";
import type { TxEnvelope } from "@oursay/public-record/schema/types";

// ── Fixed inputs ────────────────────────────────────────────────────────────────────────
export const LEVEL_MASTER_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
export const levelMaster = (): Uint8Array => hexToBytes(LEVEL_MASTER_HEX);

export const USER_ID = "user-alice";
export const THREAD_ID = "thread-belief-42";
export const LEVEL = "federal";
/** Fixed 32-byte salt_t (hex) for deterministic commitment/binding vectors. */
export const SALT_T_HEX = "a1a2a3a4a5a6a7a8a9aaabacadaeaf b0b1b2b3b4b5b6b7b8b9babbbcbdbebf".replace(/\s/g, "");

// A second thread/level to prove domain separation (must yield a DIFFERENT key).
export const THREAD_ID_2 = "thread-belief-99";
export const LEVEL_2 = "provincial";

// ── Fixed envelope fixture (a `post` create) ──────────────────────────────────────────────
export const CONTENT_SALT = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
export const CONTENT = { title: "Protected bike lanes on Main St.", body: "I support adding protected bike lanes." };
export const ENTITY_ID = "entity-belief-42";

export const CONTENT_HASH = contentCommitment({ id: ENTITY_ID, salt: CONTENT_SALT, content: CONTENT });

/** Unsigned envelope template; signEnvelope() fills authorPubkey + signature. */
export function envFixture(): TxEnvelope {
  return {
    v: 1,
    txId: "11111111-1111-4111-8111-111111111111",
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

// ── Frozen expected outputs (filled by scripts/compute-vectors.ts) ─────────────────────────
export const EXPECT = {
  contentHash: "9428fd6a850c168f7c3c447924edb2282bcf86eafda5aac1305c0432dbd1b2e5",
  threadPubkey: "0323a8ea4ff23736e96bcad3afefdc30475d06e18b780648af011c2d9fc46d61af",
  signature:
    "859f2916f8e957d12f116622c1434c6226f35bfdfc5942c79ce160332c77ed338d677f9f8ed28f3445ad86651d3d303cad5e33c201954c73be07ce1178d35942",
  txHash: "8f71db141d785a537414f64cb9c7b0cc3bc9cc7aca73378b0d9fc598b6329f89",
  commitment: "1076a12c3938dd82d72ee457cc13b56d2c0648d5b6c62b2679be6beb91cc1a33",
} as const;
