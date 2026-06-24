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
import { signBinding, signCredentialAuth } from "../src/identity/platform-binding.js";
import { requiredSignScheme } from "../src/jurisdiction.js";
import { PublicChain } from "../src/ledger/chain.js";
import type { PrivateStore } from "../src/private/store.js";
import { RecordService } from "../src/record.js";
import { type RecordType, type TxEnvelope } from "../src/schema/types.js";
import { getWorld, rejects } from "./helpers/world.js";

const RP_ID = "localhost";
const ORIGIN = "http://localhost";

/** A minimal vote envelope (unsigned, missing signerPubkey) for the pure-crypto block. */
function voteBase(authorPubkey: string, signerPubkey: string): TxEnvelope {
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
    signerPubkey,
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
  it("verifies a valid webauthn-es256 envelope (persona/signer split): assertion ↔ signerPubkey", () => {
    const personaPriv = p256.utils.randomPrivateKey();
    const signerPriv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(personaPriv), credentialPubkeyHex(signerPriv)), signerPriv);
    expect(verifyWebauthnAssertion(env)).to.equal(true);
    expect(verifyEnvelope(env)).to.equal(true);
  });

  it("returns false (not throws) when signerPubkey is missing from a webauthn envelope", () => {
    const signerPriv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(p256.utils.randomPrivateKey()), credentialPubkeyHex(signerPriv)), signerPriv);
    const { signerPubkey: _drop, ...withoutSigner } = env;
    void _drop;
    expect(verifyWebauthnAssertion(withoutSigner as TxEnvelope)).to.equal(false);
    expect(verifyEnvelope(withoutSigner as TxEnvelope)).to.equal(false);
  });

  it("rejects a tampered envelope (challenge no longer matches the assertion)", () => {
    const personaPriv = p256.utils.randomPrivateKey();
    const signerPriv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(personaPriv), credentialPubkeyHex(signerPriv)), signerPriv);
    expect(verifyEnvelope({ ...env, contentHash: "deadbeef" })).to.equal(false);
    expect(verifyEnvelope({ ...env, createdAt: new Date(Date.now() + 1000).toISOString() })).to.equal(false);
  });

  it("rejects a swapped signerPubkey (sig won't verify against the substituted key)", () => {
    const personaPriv = p256.utils.randomPrivateKey();
    const signerPriv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(personaPriv), credentialPubkeyHex(signerPriv)), signerPriv);
    expect(verifyEnvelope({ ...env, signerPubkey: credentialPubkeyHex(p256.utils.randomPrivateKey()) })).to.equal(false);
  });

  it("accepts when authorPubkey (Pₜ) differs from signerPubkey (device key)", () => {
    // The whole point of mvp-a5b: Pₜ on the record, device key signs. Crypto branch is happy when the
    // assertion verifies against signerPubkey; persona binding is enforced by the engine, not here.
    const personaPriv = p256.utils.randomPrivateKey();
    const signerPriv = p256.utils.randomPrivateKey();
    const personaPubkey = credentialPubkeyHex(personaPriv);
    const signerPubkey = credentialPubkeyHex(signerPriv);
    expect(personaPubkey).to.not.equal(signerPubkey);
    const env = signWebauthn(voteBase(personaPubkey, signerPubkey), signerPriv);
    expect(verifyEnvelope(env)).to.equal(true);
  });

  it("rejects when user-verification (UV) was not performed", () => {
    const signerPriv = p256.utils.randomPrivateKey();
    const base = voteBase(credentialPubkeyHex(p256.utils.randomPrivateKey()), credentialPubkeyHex(signerPriv));
    const challenge = signingDigest(base);
    // Hand-build an assertion with UP set but UV CLEARED (flags = 0x01), validly signed.
    const clientDataBytes = utf8ToBytes(JSON.stringify({ type: "webauthn.get", challenge: base64urlEncode(challenge), origin: ORIGIN, crossOrigin: false }));
    const authData = concatBytes(sha256(utf8ToBytes(RP_ID)), new Uint8Array([0x01]), new Uint8Array(4));
    const sig = p256.sign(sha256(concatBytes(authData, sha256(clientDataBytes))), signerPriv);
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
    const personaPriv = p256.utils.randomPrivateKey();
    const signerPriv = p256.utils.randomPrivateKey();
    const env = signWebauthn(voteBase(credentialPubkeyHex(personaPriv), credentialPubkeyHex(signerPriv)), signerPriv);
    const bad = base64urlEncode(Uint8Array.from([1, 2, 3])); // junk authData
    expect(verifyEnvelope({ ...env, webauthn: { ...env.webauthn!, authenticatorData: bad } })).to.equal(false);
  });

  it("still verifies a legacy p256 envelope (scheme absent ⇒ p256)", () => {
    const priv = p256.utils.randomPrivateKey();
    const base: TxEnvelope = { ...voteBase("", ""), type: "comment", signScheme: undefined, parentType: "post", signerPubkey: undefined };
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

describe("17 webauthn signing — appendSigned (persona/signer split, DB)", () => {
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

  interface JoinResult {
    personaPubkey: string;
    signerPubkey: string;
    signerPriv: Uint8Array;
  }

  /** Two-phase join: ensureThreadPersona (first-wins Pₜ) + registerDeviceCredential (this signer). */
  async function joinDevice(u: U, rootId: string, opts: { signerPriv?: Uint8Array } = {}): Promise<JoinResult> {
    const signerPriv = opts.signerPriv ?? p256.utils.randomPrivateKey();
    const signerPubkey = credentialPubkeyHex(signerPriv);
    // Build a commitment for this user×thread. Same opening across devices → same commitment.
    const saltT = bytesToHex(sha256(utf8ToBytes(`${u.userId}|${rootId}`))); // deterministic 32-byte hex per (user, thread)
    const { binding } = buildThreadBindingInputs({ userId: u.userId, threadPubkey: signerPubkey, threadId: rootId, jurisdiction, kycTier, saltT });
    const personaPubkey = await store.ensureThreadPersona({
      userId: u.userId,
      threadId: rootId,
      jurisdiction,
      proposedPubkey: signerPubkey,
      commitment: binding.commitment,
      kycTier,
      signBinding: (winnerPt) => {
        const winnerBinding = { ...binding, thread_pubkey: winnerPt };
        return signBinding(winnerBinding, platformPriv);
      },
    });
    const credentialSig = signCredentialAuth(
      {
        domain: "credential-auth-v1",
        personaPubkey,
        credentialPubkey: signerPubkey,
        threadId: rootId,
        jurisdiction,
        commitment: binding.commitment,
      },
      platformPriv,
    );
    await store.registerDeviceCredential({
      credentialPubkey: signerPubkey,
      personaPubkey,
      userId: u.userId,
      threadId: rootId,
      jurisdiction,
      credentialSig,
    });
    return { personaPubkey, signerPubkey, signerPriv };
  }

  async function actWa(u: U, j: JoinResult, spec: { type: RecordType; entityId: string; parent?: { type: RecordType; id: string }; content: unknown }) {
    const prep = await svc.prepareAppend({ op: "create", type: spec.type, author: j.personaPubkey, parent: spec.parent, entityId: spec.entityId, content: spec.content });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: spec.type, entityId: spec.entityId, op: "create",
      ...(spec.parent ? { parentType: spec.parent.type, parentId: spec.parent.id } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey: j.personaPubkey,
      signerPubkey: j.signerPubkey,
      signScheme: "webauthn-es256",
      signature: "",
      createdAt: new Date().toISOString(),
      prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content: spec.content }),
      ...(prep.nullifierParentId ? { nullifier: threadNullifier(u.nsecret, prep.nullifierParentId) } : {}),
    };
    return svc.appendSigned({ envelope: signWebauthn(base, j.signerPriv), salt, content: spec.content });
  }

  async function updateWa(j: JoinResult, head: { entityId: string; type: RecordType; parentType?: RecordType; parentId?: string; parentRevisionHash?: string; parentRevisionTxId?: string }, content: unknown) {
    const prep = await svc.prepareAppend({ op: "update", author: j.personaPubkey, entityId: head.entityId });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: head.type, entityId: head.entityId, op: "update",
      ...(prep.parentType ? { parentType: prep.parentType } : {}),
      ...(prep.parentId ? { parentId: prep.parentId } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey: j.personaPubkey,
      signerPubkey: j.signerPubkey,
      signScheme: "webauthn-es256",
      signature: "",
      createdAt: new Date().toISOString(),
      prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content }),
      ...(prep.nullifier ? { nullifier: prep.nullifier } : {}),
    };
    return svc.appendSigned({ envelope: signWebauthn(base, j.signerPriv), salt, content });
  }

  it("accepts a webauthn post and a webauthn vote (forced type)", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinDevice(u, postId);
    await actWa(u, post, { type: "post", entityId: postId, content: { body: "hello" } });

    const pollId = randomUUID();
    const poll = await joinDevice(u, pollId);
    await actWa(u, poll, { type: "poll", entityId: pollId, content: { question: "Q?", options: ["yes", "no"] } });
    const ref = await actWa(u, poll, { type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } });
    expect(ref.txHash).to.be.a("string");
  });

  it("second device join receives the SAME Pₜ as the first device", async () => {
    const u = await newUser();
    const threadId = randomUUID();
    const a = await joinDevice(u, threadId);
    const b = await joinDevice(u, threadId);
    expect(b.personaPubkey).to.equal(a.personaPubkey);
    expect(b.signerPubkey).to.not.equal(a.signerPubkey);
  });

  it("second device with mismatched commitment is rejected (same persona, different opening)", async () => {
    const u = await newUser();
    const threadId = randomUUID();
    await joinDevice(u, threadId);
    // Attempt phase-1 with a different commitment under the same (user, thread).
    expect(
      await rejects(
        store.ensureThreadPersona({
          userId: u.userId,
          threadId,
          jurisdiction,
          proposedPubkey: credentialPubkeyHex(p256.utils.randomPrivateKey()),
          commitment: "f".repeat(64),
          kycTier,
          signBinding: () => "00".repeat(64),
        }),
      ),
    ).to.equal(true);
  });

  it("cross-device edit: device B edits device A's post (same Pₜ, different signer)", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const a = await joinDevice(u, postId);
    await actWa(u, a, { type: "post", entityId: postId, content: { body: "v1 from A" } });

    const b = await joinDevice(u, postId);
    expect(b.personaPubkey).to.equal(a.personaPubkey);
    const ref = await updateWa(b, { entityId: postId, type: "post" }, { body: "v2 from B" });
    expect(ref.txHash).to.be.a("string");

    const state = await store.getEntityStatePublic(postId);
    expect(state?.content).to.deep.equal({ body: "v2 from B" });
  });

  it("rejects a p256-scheme vote (jurisdiction policy hard-requires webauthn-es256)", async () => {
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

  it("rejects a webauthn append whose device credential has been revoked", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinDevice(u, postId);
    await store.revokeThreadCredential(post.signerPubkey);
    expect(await rejects(actWa(u, post, { type: "post", entityId: postId, content: { body: "x" } }))).to.equal(true);
  });

  it("rejects a webauthn append missing signerPubkey", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinDevice(u, postId);
    const prep = await svc.prepareAppend({ op: "create", type: "post", author: post.personaPubkey, entityId: postId, content: { body: "x" } });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: "post", entityId: postId, op: "create",
      authorPubkey: post.personaPubkey,
      signScheme: "webauthn-es256",
      signature: "",
      createdAt: new Date().toISOString(),
      prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content: { body: "x" } }),
    };
    const env = signWebauthn(base, post.signerPriv);
    const { signerPubkey: _drop, ...noSigner } = env;
    void _drop;
    expect(await rejects(svc.appendSigned({ envelope: noSigner as TxEnvelope, salt, content: { body: "x" } }))).to.equal(true);
  });

  it("re-verifies credential_sig: tampering the stored attestation breaks append", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinDevice(u, postId);
    // Tamper credential_sig directly (simulating a DB-modified row that escapes the join attest).
    // 64 zero bytes (128 hex chars) is a valid-shaped but invalid P-256 signature → verifyCredentialAuth false.
    const pool: import("pg").Pool = (store as unknown as { pool: import("pg").Pool }).pool;
    await pool.query(
      `UPDATE thread_civic_credentials SET credential_sig = $1 WHERE credential_pubkey = $2`,
      ["0".repeat(128), post.signerPubkey],
    );
    expect(await rejects(actWa(u, post, { type: "post", entityId: postId, content: { body: "x" } }))).to.equal(true);
  });

  it("rejects a forged assertion (signer key mismatch)", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const post = await joinDevice(u, postId);
    const prep = await svc.prepareAppend({ op: "create", type: "post", author: post.personaPubkey, entityId: postId, content: { body: "x" } });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: "post", entityId: postId, op: "create",
      authorPubkey: post.personaPubkey,
      signerPubkey: post.signerPubkey,
      signScheme: "webauthn-es256",
      signature: "",
      createdAt: new Date().toISOString(),
      prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content: { body: "x" } }),
    };
    const good = signWebauthn(base, post.signerPriv);
    // Forge: replace the signature with another key's signature over the same digest.
    const forgedSig = buildWebauthnAssertion({ credentialPriv: p256.utils.randomPrivateKey(), rpId: RP_ID, origin: ORIGIN, challenge: signingDigest(base) }).signature;
    expect(await rejects(svc.appendSigned({ envelope: { ...good, webauthn: { ...good.webauthn!, signature: forgedSig } }, salt, content: { body: "x" } }))).to.equal(true);
  });
});
