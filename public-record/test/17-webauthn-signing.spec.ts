import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { contentCommitment, newSalt } from "../src/crypto/commitment.js";
import { deriveNullifierSecret, threadNullifier } from "../src/identity/nullifier.js";
import { signEnvelope, signingDigest, verifyEnvelope } from "../src/identity/envelope.js";
import {
  base64urlEncode,
  buildWebauthnAssertion,
  credentialPubkeyHex,
  verifyWebauthnAssertion,
} from "../src/identity/webauthn.js";
import { buildThreadBindingInputs } from "../src/identity/binding.js";
import { signBinding } from "../src/identity/platform-binding.js";
import { requiredSignScheme } from "../src/jurisdiction.js";
import { PublicChain } from "../src/ledger/chain.js";
import type { PrivateStore } from "../src/private/store.js";
import { RecordService } from "../src/record.js";
import { type RecordType, type TxEnvelope } from "../src/schema/types.js";
import { getWorld, rejects } from "./helpers/world.js";

const RP_ID = "localhost";
const ORIGIN = "http://localhost";

/** A minimal vote envelope (unsigned) for the pure-crypto block. */
function voteBase(authorPubkey: string): TxEnvelope {
  const txId = randomUUID();
  return {
    v: 1,
    txId,
    type: "vote",
    entityId: randomUUID(),
    op: "create",
    parentType: "poll",
    parentId: randomUUID(),
    authorPubkey,
    signScheme: "webauthn-es256",
    signature: "",
    createdAt: new Date().toISOString(),
    prevHash: null,
    contentHash: contentCommitment({ id: txId, salt: newSalt(), content: { option: "yes" } }),
    nullifier: bytesToHex(sha256(utf8ToBytes("n"))),
  };
}

function signWebauthn(base: TxEnvelope, credPriv: Uint8Array): TxEnvelope {
  const webauthn = buildWebauthnAssertion({ credentialPriv: credPriv, rpId: RP_ID, origin: ORIGIN, challenge: signingDigest(base) });
  return { ...base, webauthn };
}

describe("17 webauthn signing — verifier, policy (pure)", () => {
  it("verifies a valid webauthn-es256 envelope (assertion + scheme branch)", () => {
    const priv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(priv)), priv);
    expect(verifyWebauthnAssertion(env)).to.equal(true);
    expect(verifyEnvelope(env)).to.equal(true);
  });

  it("rejects a tampered envelope (challenge no longer matches the assertion)", () => {
    const priv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(priv)), priv);
    expect(verifyEnvelope({ ...env, contentHash: "deadbeef" })).to.equal(false);
    expect(verifyEnvelope({ ...env, createdAt: new Date(Date.now() + 1000).toISOString() })).to.equal(false);
  });

  it("rejects a wrong author pubkey", () => {
    const priv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(priv)), priv);
    expect(verifyEnvelope({ ...env, authorPubkey: credentialPubkeyHex(p256.utils.randomPrivateKey()) })).to.equal(false);
  });

  it("rejects when user-verification (UV) was not performed", () => {
    const priv = p256.utils.randomPrivateKey();
    const base = voteBase(credentialPubkeyHex(priv));
    const challenge = signingDigest(base);
    // Hand-build an assertion with UP set but UV CLEARED (flags = 0x01), validly signed.
    const clientDataBytes = utf8ToBytes(JSON.stringify({ type: "webauthn.get", challenge: base64urlEncode(challenge), origin: ORIGIN, crossOrigin: false }));
    const authData = concatBytes(sha256(utf8ToBytes(RP_ID)), new Uint8Array([0x01]), new Uint8Array(4));
    const sig = p256.sign(sha256(concatBytes(authData, sha256(clientDataBytes))), priv);
    const env: TxEnvelope = {
      ...base,
      webauthn: {
        authenticatorData: base64urlEncode(authData),
        clientDataJSON: base64urlEncode(clientDataBytes),
        signature: base64urlEncode(sig.toDERRawBytes()),
      },
    };
    expect(verifyEnvelope(env)).to.equal(false);
  });

  it("rejects a mutated authenticatorData (signature no longer valid)", () => {
    const priv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(priv)), priv);
    const bad = base64urlEncode(Uint8Array.from([1, 2, 3])); // junk authData
    expect(verifyEnvelope({ ...env, webauthn: { ...env.webauthn!, authenticatorData: bad } })).to.equal(false);
  });

  it("still verifies a legacy p256 envelope (scheme absent ⇒ p256)", () => {
    const priv = p256.utils.randomPrivateKey();
    const base: TxEnvelope = { ...voteBase(""), type: "comment", signScheme: undefined, parentType: "post" };
    const { envelope } = signEnvelope(base, priv);
    expect(envelope.signScheme).to.equal(undefined);
    expect(verifyEnvelope(envelope)).to.equal(true);
  });

  it("requiredSignScheme: vote & petition_signature are forced to webauthn-es256; others unconstrained", () => {
    expect(requiredSignScheme("vote")).to.equal("webauthn-es256");
    expect(requiredSignScheme("petition_signature")).to.equal("webauthn-es256");
    for (const t of ["post", "comment", "reaction", "poll", "petition"] as RecordType[]) {
      expect(requiredSignScheme(t)).to.equal(null);
    }
  });
});

describe("17 webauthn signing — appendSigned (verified path, DB)", () => {
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const jurisdiction = "ab-ca-gov";
  const kycTier = "residency_verified";

  let store: PrivateStore;
  let svc: RecordService;

  before(async () => {
    const w = await getWorld();
    store = w.store;
    await store.reset();
    const chainId = randomUUID();
    // Default enforceSigningPolicy:true — the production civic path.
    svc = new RecordService(new PublicChain(store, chainId), store, { platformBindingPrivKeyHex: platformPriv, signedEnvelopeMaxAgeSec: 0 });
  });

  interface U { userId: string; nsecret: Uint8Array; lm: Uint8Array }
  async function newUser(): Promise<U> {
    const userId = randomUUID();
    await store.putUser({ id: userId });
    const lm = p256.utils.randomPrivateKey();
    await store.putJurisdictionMaster({ userId, jurisdiction, masterPubkey: bytesToHex(p256.getPublicKey(lm)) });
    return { userId, lm, nsecret: deriveNullifierSecret(lm, jurisdiction) };
  }

  /** Register a thread via a per-thread WebAuthn credential (thread_keys + binding + civic credential). */
  async function joinWebauthn(u: U, rootId: string): Promise<{ credPriv: Uint8Array; authorPubkey: string }> {
    const credPriv = p256.utils.randomPrivateKey();
    const authorPubkey = credentialPubkeyHex(credPriv);
    const { binding } = buildThreadBindingInputs({ userId: u.userId, threadPubkey: authorPubkey, threadId: rootId, jurisdiction, kycTier, saltT: newSalt() });
    await store.registerThreadBinding({ threadPubkey: authorPubkey, userId: u.userId, threadId: rootId, jurisdiction, kycTier, commitment: binding.commitment, bindingSig: signBinding(binding, platformPriv) });
    await store.registerThreadCredential({ credentialPubkey: authorPubkey, userId: u.userId, threadId: rootId, jurisdiction });
    return { credPriv, authorPubkey };
  }

  async function actWa(u: U, credPriv: Uint8Array, authorPubkey: string, spec: { type: RecordType; entityId: string; parent?: { type: RecordType; id: string }; content: unknown }) {
    const prep = await svc.prepareAppend({ op: "create", type: spec.type, author: authorPubkey, parent: spec.parent, entityId: spec.entityId, content: spec.content });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: spec.type, entityId: spec.entityId, op: "create",
      ...(spec.parent ? { parentType: spec.parent.type, parentId: spec.parent.id } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey, signScheme: "webauthn-es256", signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content: spec.content }),
      ...(prep.nullifierParentId ? { nullifier: threadNullifier(u.nsecret, prep.nullifierParentId) } : {}),
    };
    return svc.appendSigned({ envelope: signWebauthn(base, credPriv), salt, content: spec.content });
  }

  it("accepts a webauthn post and a webauthn vote (forced type)", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinWebauthn(u, postId);
    await actWa(u, post.credPriv, post.authorPubkey, { type: "post", entityId: postId, content: { body: "hello" } });

    const pollId = randomUUID();
    const poll = await joinWebauthn(u, pollId);
    await actWa(u, poll.credPriv, poll.authorPubkey, { type: "poll", entityId: pollId, content: { question: "Q?", options: ["yes", "no"] } });
    const ref = await actWa(u, poll.credPriv, poll.authorPubkey, { type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } });
    expect(ref.txHash).to.be.a("string");
  });

  it("rejects a p256-scheme vote (jurisdiction policy hard-requires webauthn-es256)", async () => {
    // The policy gate fires by record TYPE, before any author lookup — a p256 vote is refused outright.
    const priv = p256.utils.randomPrivateKey();
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: "vote", entityId: randomUUID(), op: "create", parentType: "poll", parentId: randomUUID(),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content: { option: "no" } }),
      nullifier: bytesToHex(sha256(utf8ToBytes("n"))),
    };
    const { envelope } = signEnvelope(base, priv);
    expect(await rejects(svc.appendSigned({ envelope, salt, content: { option: "no" } }))).to.equal(true);
  });

  it("rejects a webauthn append whose credential has been revoked", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinWebauthn(u, postId);
    await store.revokeThreadCredential(post.authorPubkey);
    expect(await rejects(actWa(u, post.credPriv, post.authorPubkey, { type: "post", entityId: postId, content: { body: "x" } }))).to.equal(true);
  });

  it("rejects a forged assertion and a missing assertion", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinWebauthn(u, postId);
    const prep = await svc.prepareAppend({ op: "create", type: "post", author: post.authorPubkey, entityId: postId, content: { body: "x" } });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: "post", entityId: postId, op: "create",
      authorPubkey: post.authorPubkey, signScheme: "webauthn-es256", signature: "", createdAt: new Date().toISOString(), prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content: { body: "x" } }),
    };
    const good = signWebauthn(base, post.credPriv);
    // Forge: replace the signature with another key's signature over the same digest.
    const forgedSig = buildWebauthnAssertion({ credentialPriv: p256.utils.randomPrivateKey(), rpId: RP_ID, origin: ORIGIN, challenge: signingDigest(base) }).signature;
    expect(await rejects(svc.appendSigned({ envelope: { ...good, webauthn: { ...good.webauthn!, signature: forgedSig } }, salt, content: { body: "x" } }))).to.equal(true);
    // Missing assertion entirely.
    const { webauthn, ...noWa } = good;
    void webauthn;
    expect(await rejects(svc.appendSigned({ envelope: noWa as TxEnvelope, salt, content: { body: "x" } }))).to.equal(true);
  });
});
