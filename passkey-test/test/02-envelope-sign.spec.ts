// Q3 — P-256 signing of a canonical TxEnvelope: verify, tamper-detection, txHashOf alignment.
import { expect } from "chai";
import { hashLeaf } from "@oursay/public-record/crypto/merkle";
import { canonicalJson } from "@oursay/public-record/crypto/commitment";
import { txHashOf } from "@oursay/public-record/ledger/chain";
import { deriveThreadKey } from "../src/derive.js";
import { signEnvelope, verifyEnvelope, UNSIGNED } from "../src/envelope.js";
import { levelMaster, THREAD_ID, LEVEL, envFixture, EXPECT } from "../src/vectors.js";

function sign() {
  const key = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
  return signEnvelope(envFixture(), key.privKey);
}

describe("02 envelope: P-256 sign / verify", () => {
  it("sets authorPubkey to the derived thread pubkey and verifies; matches frozen vectors", () => {
    const { envelope, txHash } = sign();
    expect(envelope.authorPubkey).to.equal(EXPECT.threadPubkey);
    expect(envelope.signature).to.equal(EXPECT.signature);
    expect(txHash).to.equal(EXPECT.txHash);
    expect(verifyEnvelope(envelope)).to.equal(true);
  });

  it("the leaf equals public-record's txHashOf over the FULL (signed) envelope", () => {
    const { envelope, txHash } = sign();
    expect(txHash).to.equal(txHashOf(envelope));
    // and that is hashLeaf over the canonical full envelope (incl. signature)
    expect(txHash).to.equal(hashLeaf(canonicalJson(envelope)));
  });

  it("rejects a tampered field (and the leaf changes)", () => {
    const { envelope, txHash } = sign();
    const tampered = { ...envelope, createdAt: "2026-01-02T00:00:00.000Z" };
    expect(verifyEnvelope(tampered)).to.equal(false);
    expect(txHashOf(tampered)).to.not.equal(txHash);
  });

  it("rejects a tampered signature and an unsigned envelope", () => {
    const { envelope } = sign();
    const flipped = envelope.signature.slice(0, -2) + (envelope.signature.endsWith("00") ? "01" : "00");
    expect(verifyEnvelope({ ...envelope, signature: flipped })).to.equal(false);
    expect(verifyEnvelope({ ...envelope, signature: UNSIGNED })).to.equal(false);
  });
});
