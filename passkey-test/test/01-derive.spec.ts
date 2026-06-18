// Q3 — HKDF per-thread derivation: determinism + domain separation + frozen vector.
import { expect } from "chai";
import { deriveThreadKey, deriveThreadPrivateKey } from "../src/derive.js";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE } from "@noble/curves/abstract/utils";
import { levelMaster, THREAD_ID, LEVEL, THREAD_ID_2, LEVEL_2, EXPECT } from "../src/vectors.js";

describe("01 derive: HKDF per-thread P-256 key", () => {
  it("is deterministic for fixed inputs and matches the frozen vector", () => {
    const a = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    const b = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    expect(a.threadPubkey).to.equal(b.threadPubkey);
    expect(a.threadPubkey).to.equal(EXPECT.threadPubkey);
  });

  it("domain-separates: a different thread_id yields a different key", () => {
    const base = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    const other = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID_2, level: LEVEL });
    expect(other.threadPubkey).to.not.equal(base.threadPubkey);
  });

  it("domain-separates: a different level yields a different key", () => {
    const base = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    const other = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL_2 });
    expect(other.threadPubkey).to.not.equal(base.threadPubkey);
  });

  it("produces a valid P-256 scalar in [1, n-1]", () => {
    const priv = deriveThreadPrivateKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
    const k = bytesToNumberBE(priv);
    expect(k > 0n).to.equal(true);
    expect(k < p256.CURVE.n).to.equal(true);
  });
});
