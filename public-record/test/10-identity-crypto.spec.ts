// A1 unit suite (NO DB): promoted identity primitives — derivation, envelope signing, commitment.
// Run standalone without Postgres/immudb: `npx mocha test/10-identity-crypto.spec.ts`.
import { expect } from "chai";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE } from "@noble/curves/abstract/utils";
import { deriveThreadKey, deriveThreadPrivateKey } from "../src/identity/derive.js";
import { signEnvelope, verifyEnvelope, UNSIGNED } from "../src/identity/envelope.js";
import { threadCommitment } from "../src/crypto/commitment.js";
import { hashLeaf } from "../src/crypto/merkle.js";
import { canonicalJson } from "../src/crypto/commitment.js";
import { txHashOf } from "../src/ledger/chain.js";
import {
  levelMaster, USER_ID, THREAD_ID, LEVEL, THREAD_ID_2, LEVEL_2, SALT_T_HEX, envFixture, EXPECT,
} from "./fixtures/identity-vectors.js";

describe("10 identity/derive: HKDF per-thread P-256 key", () => {
  it("is deterministic and matches the frozen vector", () => {
    const a = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    const b = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    expect(a.threadPubkey).to.equal(b.threadPubkey);
    expect(a.threadPubkey).to.equal(EXPECT.threadPubkey);
  });

  it("domain-separates on thread_id and on level", () => {
    const base = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    const otherThread = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID_2, level: LEVEL });
    const otherLevel = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL_2 });
    expect(otherThread.threadPubkey).to.not.equal(base.threadPubkey);
    expect(otherLevel.threadPubkey).to.not.equal(base.threadPubkey);
  });

  it("produces a valid P-256 scalar in [1, n-1]", () => {
    const k = bytesToNumberBE(deriveThreadPrivateKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL }));
    expect(k > 0n).to.equal(true);
    expect(k < p256.CURVE.n).to.equal(true);
  });
});

describe("10 identity/envelope: P-256 sign / verify", () => {
  const key = () => deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });

  it("signs, sets authorPubkey, verifies, and matches frozen vectors", () => {
    const { envelope, txHash } = signEnvelope(envFixture(), key().privKey);
    expect(envelope.authorPubkey).to.equal(EXPECT.threadPubkey);
    expect(envelope.signature).to.equal(EXPECT.signature);
    expect(txHash).to.equal(EXPECT.txHash);
    expect(verifyEnvelope(envelope)).to.equal(true);
  });

  it("leaf equals txHashOf == hashLeaf(canonicalJson(full envelope))", () => {
    const { envelope, txHash } = signEnvelope(envFixture(), key().privKey);
    expect(txHash).to.equal(txHashOf(envelope));
    expect(txHash).to.equal(hashLeaf(canonicalJson(envelope)));
  });

  it("rejects tampered field, tampered signature, and unsigned", () => {
    const { envelope, txHash } = signEnvelope(envFixture(), key().privKey);
    expect(verifyEnvelope({ ...envelope, createdAt: "2026-01-02T00:00:00.000Z" })).to.equal(false);
    expect(txHashOf({ ...envelope, createdAt: "2026-01-02T00:00:00.000Z" })).to.not.equal(txHash);
    const flipped = envelope.signature.slice(0, -2) + (envelope.signature.endsWith("00") ? "01" : "00");
    expect(verifyEnvelope({ ...envelope, signature: flipped })).to.equal(false);
    expect(verifyEnvelope({ ...envelope, signature: UNSIGNED })).to.equal(false);
  });
});

describe("10 crypto/threadCommitment", () => {
  const base = { userId: USER_ID, saltT: SALT_T_HEX, threadId: THREAD_ID, level: LEVEL };

  it("is deterministic, matches the frozen vector, and is opaque", () => {
    expect(threadCommitment(base)).to.equal(EXPECT.commitment);
    expect(threadCommitment(base)).to.match(/^[0-9a-f]{64}$/);
    expect(threadCommitment(base)).to.not.contain(USER_ID);
    expect(threadCommitment(base)).to.not.contain(SALT_T_HEX);
  });

  it("changes when any input changes", () => {
    const c = threadCommitment(base);
    expect(threadCommitment({ ...base, saltT: "00".repeat(32) })).to.not.equal(c);
    expect(threadCommitment({ ...base, userId: "user-bob" })).to.not.equal(c);
    expect(threadCommitment({ ...base, threadId: "thread-other" })).to.not.equal(c);
    expect(threadCommitment({ ...base, level: "municipal" })).to.not.equal(c);
  });
});
