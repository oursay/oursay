// A1 unit suite (NO DB): promoted identity primitives — derivation, envelope signing, commitment.
// Run standalone without Postgres/immudb: `npx mocha test/10-identity-crypto.spec.ts`.
import { expect } from "chai";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE } from "@noble/curves/abstract/utils";
import { deriveThreadKey, deriveThreadPrivateKey } from "../src/identity/derive.js";
import { deriveDeviceThreadSigner, signEnvelopeWithDevice } from "../src/identity/device.js";
import { signEnvelope, verifyEnvelope, UNSIGNED } from "../src/identity/envelope.js";
import { threadCommitment } from "../src/crypto/commitment.js";
import { deriveNullifierSecret, threadNullifier } from "../src/identity/nullifier.js";
import { hashLeaf } from "../src/crypto/merkle.js";
import { canonicalJson } from "../src/crypto/commitment.js";
import { txHashOf } from "../src/ledger/chain.js";
import {
  jurisdictionMaster, USER_ID, THREAD_ID, JURISDICTION, THREAD_ID_2, JURISDICTION_2, SALT_T_HEX, envFixture, EXPECT,
} from "./fixtures/identity-vectors.js";

describe("10 identity/derive: HKDF per-thread P-256 key", () => {
  it("is deterministic and matches the frozen vector", () => {
    const a = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    const b = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    expect(a.threadPubkey).to.equal(b.threadPubkey);
    expect(a.threadPubkey).to.equal(EXPECT.threadPubkey);
  });

  it("domain-separates on thread_id and on jurisdiction", () => {
    const base = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    const otherThread = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID_2, jurisdiction: JURISDICTION });
    const otherJurisdiction = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION_2 });
    expect(otherThread.threadPubkey).to.not.equal(base.threadPubkey);
    expect(otherJurisdiction.threadPubkey).to.not.equal(base.threadPubkey);
  });

  it("produces a valid P-256 scalar in [1, n-1]", () => {
    const k = bytesToNumberBE(deriveThreadPrivateKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION }));
    expect(k > 0n).to.equal(true);
    expect(k < p256.CURVE.n).to.equal(true);
  });
});

describe("10 identity/envelope: P-256 sign / verify", () => {
  const key = () => deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION });

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

describe("10 identity/device: thread-scoped device signer (Method 3)", () => {
  const deviceRoot = () => jurisdictionMaster(); // any 32-byte on-device secret works as the device root

  it("derives a deterministic, thread/jurisdiction-domain-separated signer that is a valid P-256 scalar", () => {
    const a = deriveDeviceThreadSigner({ deviceRoot: deviceRoot(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    const b = deriveDeviceThreadSigner({ deviceRoot: deviceRoot(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    expect(a.signerPubkey).to.equal(b.signerPubkey);
    expect(deriveDeviceThreadSigner({ deviceRoot: deviceRoot(), threadId: THREAD_ID_2, jurisdiction: JURISDICTION }).signerPubkey).to.not.equal(a.signerPubkey);
    expect(deriveDeviceThreadSigner({ deviceRoot: deviceRoot(), threadId: THREAD_ID, jurisdiction: JURISDICTION_2 }).signerPubkey).to.not.equal(a.signerPubkey);
    const k = bytesToNumberBE(a.privKey);
    expect(k > 0n && k < p256.CURVE.n).to.equal(true);
  });

  it("is distinct from the persona thread key derived from the same root (separate domain)", () => {
    const signer = deriveDeviceThreadSigner({ deviceRoot: deviceRoot(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    const persona = deriveThreadKey({ jurisdictionMaster: deviceRoot(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    expect(signer.signerPubkey).to.not.equal(persona.threadPubkey);
  });

  it("signs as author=persona, signer=device; verifies against the device key; tampering fails", () => {
    const persona = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    const signer = deriveDeviceThreadSigner({ deviceRoot: deviceRoot(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
    const { envelope, txHash } = signEnvelopeWithDevice(envFixture(), signer.privKey, persona.threadPubkey);
    expect(envelope.authorPubkey).to.equal(persona.threadPubkey);
    expect(envelope.signerPubkey).to.equal(signer.signerPubkey);
    expect(envelope.authorPubkey).to.not.equal(envelope.signerPubkey);
    expect(verifyEnvelope(envelope)).to.equal(true);
    expect(txHash).to.equal(txHashOf(envelope));
    // the persona did NOT sign — verifying as if it were the signer must fail
    expect(verifyEnvelope({ ...envelope, signerPubkey: undefined })).to.equal(false);
    // tampering the persona label breaks the signature (author is bound into the digest)
    expect(verifyEnvelope({ ...envelope, authorPubkey: persona.threadPubkey.replace(/.$/, "0") })).to.equal(false);
  });
});

describe("10 crypto/threadCommitment", () => {
  const base = { userId: USER_ID, saltT: SALT_T_HEX, threadId: THREAD_ID, jurisdiction: JURISDICTION };

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
    expect(threadCommitment({ ...base, jurisdiction: "mun-edm-ca-gov" })).to.not.equal(c);
  });
});

describe("10 identity/nullifier", () => {
  const secret = () => deriveNullifierSecret(jurisdictionMaster(), JURISDICTION);

  it("is deterministic per (secret, parent) and a 32-byte opaque hex", () => {
    const n = threadNullifier(secret(), "poll-1");
    expect(n).to.equal(threadNullifier(secret(), "poll-1"));
    expect(n).to.match(/^[0-9a-f]{64}$/);
    expect(n).to.not.contain("poll-1");
  });

  it("is unlinkable across parents and across jurisdictions", () => {
    const n1 = threadNullifier(secret(), "poll-1");
    expect(threadNullifier(secret(), "poll-2")).to.not.equal(n1); // different parent
    const otherJurisdictionSecret = deriveNullifierSecret(jurisdictionMaster(), JURISDICTION_2);
    expect(threadNullifier(otherJurisdictionSecret, "poll-1")).to.not.equal(n1); // different jurisdiction
  });

  it("the nullifier secret is distinct from the thread-derivation output", () => {
    // sanity: secret derived under a different domain than thread keys
    expect(bytesToNumberBE(secret())).to.not.equal(
      bytesToNumberBE(deriveThreadPrivateKey({ jurisdictionMaster: jurisdictionMaster(), threadId: "poll-1", jurisdiction: JURISDICTION })),
    );
  });
});

describe("10 A1 regression: two SAME-LEVEL jurisdictions stay independent", () => {
  // ab-ca-gov and bc-ca-gov are both 'provincial' level. Pre-fix, secrets were keyed by LEVEL, so
  // these would have collided (shared persona + shared nullifier). Keying by JURISDICTION fixes it.
  const AB = "ab-ca-gov";
  const BC = "bc-ca-gov";
  const master = () => jurisdictionMaster();

  it("yields a DISTINCT persona per jurisdiction for the same user + thread", () => {
    const ab = deriveThreadKey({ jurisdictionMaster: master(), threadId: THREAD_ID, jurisdiction: AB });
    const bc = deriveThreadKey({ jurisdictionMaster: master(), threadId: THREAD_ID, jurisdiction: BC });
    expect(ab.threadPubkey).to.not.equal(bc.threadPubkey);
  });

  it("yields a DISTINCT singleton nullifier per jurisdiction for the same parent", () => {
    const nAb = threadNullifier(deriveNullifierSecret(master(), AB), "poll-shared");
    const nBc = threadNullifier(deriveNullifierSecret(master(), BC), "poll-shared");
    expect(nAb).to.not.equal(nBc);
  });
});
