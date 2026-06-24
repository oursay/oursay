import { expect } from "chai";
import { randomBytes, randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { bytesToHex } from "@noble/hashes/utils";
import { blockConfig } from "../src/config.js";
import { contentCommitment, newSalt } from "../src/crypto/commitment.js";
import { deriveThreadKey } from "../src/identity/derive.js";
import { deriveDeviceThreadSigner, signEnvelopeWithDevice } from "../src/identity/device.js";
import { signEnvelope } from "../src/identity/envelope.js";
import { deriveNullifierSecret, threadNullifier } from "../src/identity/nullifier.js";
import { buildThreadBindingInputs } from "../src/identity/binding.js";
import { signBinding } from "../src/identity/platform-binding.js";
import { PublicChain } from "../src/ledger/chain.js";
import { BlockSettler } from "../src/ledger/settler.js";
import type { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import type { PrivateStore } from "../src/private/store.js";
import { RecordService } from "../src/record.js";
import { type RecordType, type TxEnvelope } from "../src/schema/types.js";
import { getWorld, rejects } from "./helpers/world.js";

/**
 * Method 3 (§5.4) multi-device / cross-device editing. A verified user enrols several hardware-backed
 * DEVICE keys; each device derives a THREAD-SCOPED signer per thread. Envelopes carry `author` = the
 * stable thread persona and `signer` = the per-(device, thread) key; any enrolled device of the same
 * user may act for the persona — including editing content first written from another device. The
 * published signer is thread-scoped, so the same device shows no cross-thread correlator (Method 5
 * ruled out). The reserved ZK `proof` slot is rejected until Method 4 is built.
 */
describe("14 device signing: multi-device, cross-device edit, thread-scoped signers", () => {
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const jurisdiction = "ab-ca-gov";
  const kycTier = "residency_verified";

  let store: PrivateStore;
  let connector: PgWireLedgerConnector;
  let svc: RecordService;
  let settler: BlockSettler;

  before(async () => {
    const w = await getWorld();
    store = w.store;
    connector = w.connector;
    await store.reset();
    const chainId = randomUUID();
    // enforceSigningPolicy:false — this spec exercises the legacy p256 device-signer path on forced
    // types (vote); the webauthn-es256 hard requirement is covered in webauthn-envelope.spec.
    svc = new RecordService(new PublicChain(store, chainId), store, { platformBindingPrivKeyHex: platformPriv, signedEnvelopeMaxAgeSec: 0, enforceSigningPolicy: false });
    settler = new BlockSettler(store, connector, chainId, blockConfig);
  });

  interface U { userId: string; lm: Uint8Array; nroot: Uint8Array }
  interface Device { deviceId: string; root: Uint8Array; devicePubkey: string }
  interface Signer { privKey: Uint8Array; signerPubkey: string }

  async function newUser(): Promise<U> {
    const userId = randomUUID();
    await store.putUser({ id: userId });
    const lm = p256.utils.randomPrivateKey();
    await store.putJurisdictionMaster({ userId, jurisdiction, masterPubkey: bytesToHex(p256.getPublicKey(lm)) });
    // The per-(user, jurisdiction) nullifier root: one secret shared across the user's devices (§5.4).
    return { userId, lm, nroot: deriveNullifierSecret(lm, jurisdiction) };
  }

  /** Register this user's stable thread persona (author id) for a ROOT entity (thread = root). */
  async function registerThread(u: U, rootId: string): Promise<string> {
    const { threadPubkey } = deriveThreadKey({ jurisdictionMaster: u.lm, threadId: rootId, jurisdiction });
    const { binding } = buildThreadBindingInputs({ userId: u.userId, threadPubkey, threadId: rootId, jurisdiction, kycTier, saltT: newSalt() });
    await store.registerThreadBinding({
      threadPubkey, userId: u.userId, threadId: rootId, jurisdiction, kycTier,
      commitment: binding.commitment, bindingSig: signBinding(binding, platformPriv),
    });
    return threadPubkey;
  }

  /** Enrol a hardware-backed device key for a user (PUBLIC, account-level — never on an envelope). */
  async function enrollDevice(u: U): Promise<Device> {
    const root = randomBytes(32); // the on-device signer root (IKM)
    const devicePubkey = bytesToHex(p256.getPublicKey(p256.utils.randomPrivateKey())); // account-level pubkey
    const deviceId = await store.enrollDeviceKey({ userId: u.userId, devicePubkey });
    return { deviceId, root, devicePubkey };
  }

  /** Derive (but do NOT register) a device's thread-scoped signer. */
  function signerFor(device: Device, threadId: string): Signer {
    return deriveDeviceThreadSigner({ deviceRoot: device.root, threadId, jurisdiction });
  }

  /** Derive AND register a device's thread-scoped signer for a thread (the private device→user map). */
  async function registerSigner(u: U, device: Device, threadId: string): Promise<Signer> {
    const s = signerFor(device, threadId);
    await store.registerThreadSigner({ signerPubkey: s.signerPubkey, userId: u.userId, deviceId: device.deviceId, threadId, jurisdiction });
    return s;
  }

  /** prepare → build → sign with a DEVICE key (author = persona) → appendSigned. */
  async function actDevice(
    u: U,
    signer: Signer,
    persona: string,
    spec: { type: RecordType; entityId: string; parent?: { type: RecordType; id: string }; content: unknown; proof?: string },
  ) {
    const prep = await svc.prepareAppend({ op: "create", type: spec.type, author: persona, parent: spec.parent, entityId: spec.entityId, content: spec.content });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: spec.type, entityId: spec.entityId, op: "create",
      ...(spec.parent ? { parentType: spec.parent.type, parentId: spec.parent.id } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content: spec.content }),
      ...(prep.nullifierParentId ? { nullifier: threadNullifier(u.nroot, prep.nullifierParentId) } : {}),
      ...(spec.proof ? { proof: spec.proof } : {}),
    };
    const { envelope } = signEnvelopeWithDevice(base, signer.privKey, persona);
    return svc.appendSigned({ envelope, salt, content: spec.content });
  }

  /** prepare(update|delete) → carry head fields → sign with a DEVICE key → appendSigned. */
  async function actDeviceMutation(
    signer: Signer,
    persona: string,
    spec: { op: "update" | "delete"; type: RecordType; entityId: string; content: unknown },
  ) {
    const prep = await svc.prepareAppend({ op: spec.op, author: persona, entityId: spec.entityId });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: spec.type, entityId: spec.entityId, op: spec.op,
      ...(prep.parentType ? { parentType: prep.parentType } : {}),
      ...(prep.parentId ? { parentId: prep.parentId } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content: spec.content }),
      ...(prep.nullifier ? { nullifier: prep.nullifier } : {}),
    };
    const { envelope } = signEnvelopeWithDevice(base, signer.privKey, persona);
    return svc.appendSigned({ envelope, salt, content: spec.content });
  }

  it("device signs as the persona; a SECOND device edits the first device's content (cross-device edit)", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const persona = await registerThread(u, postId);
    const devA = await enrollDevice(u);
    const devB = await enrollDevice(u);
    const sA = await registerSigner(u, devA, postId);
    const sB = await registerSigner(u, devB, postId);

    await actDevice(u, sA, persona, { type: "post", entityId: postId, content: { body: "p" } });
    const c1 = randomUUID();
    await actDevice(u, sA, persona, { type: "comment", entityId: c1, parent: { type: "post", id: postId }, content: { body: "v1 from phone A" } });

    // the published comment carries the PERSONA as author and a THREAD-SCOPED signer (≠ persona).
    const head = (await store.getHeadTx(c1))!;
    expect(head.authorPubkey).to.equal(persona);
    const env = JSON.parse(head.envelope) as TxEnvelope;
    expect(env.signerPubkey).to.equal(sA.signerPubkey);
    expect(env.signerPubkey).to.not.equal(persona);

    // phone B edits phone A's comment — accepted because B is an enrolled device of the same user.
    await actDeviceMutation(sB, persona, { op: "update", type: "comment", entityId: c1, content: { body: "v2 from phone B" } });
    await settler.flushPendingSettlement();

    expect((await store.getEntityState(c1))!.content).to.deep.equal({ body: "v2 from phone B" });
    const edited = JSON.parse((await store.getHeadTx(c1))!.envelope) as TxEnvelope;
    expect(edited.authorPubkey).to.equal(persona); // persona unchanged on the record
    expect(edited.signerPubkey).to.equal(sB.signerPubkey); // a different device signed
  });

  it("rejects an unregistered signer, a revoked signer, and a revoked device", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const persona = await registerThread(u, postId);
    const devA = await enrollDevice(u);
    const sA = await registerSigner(u, devA, postId);
    await actDevice(u, sA, persona, { type: "post", entityId: postId, content: { body: "p" } });

    // a signer that was derived but never registered ⇒ rejected
    const devGhost = await enrollDevice(u);
    const sGhost = signerFor(devGhost, postId); // not registered
    expect(await rejects(actDevice(u, sGhost, persona, { type: "comment", entityId: randomUUID(), parent: { type: "post", id: postId }, content: { body: "x" } }))).to.equal(true);

    // revoke the registered signer ⇒ rejected
    await store.revokeThreadSigner(sA.signerPubkey);
    expect(await rejects(actDevice(u, sA, persona, { type: "comment", entityId: randomUUID(), parent: { type: "post", id: postId }, content: { body: "y" } }))).to.equal(true);

    // a fresh device, registered, then its DEVICE revoked ⇒ its signers stop working
    const devC = await enrollDevice(u);
    const sC = await registerSigner(u, devC, postId);
    await store.revokeDeviceKey(devC.devicePubkey);
    expect(await rejects(actDevice(u, sC, persona, { type: "comment", entityId: randomUUID(), parent: { type: "post", id: postId }, content: { body: "z" } }))).to.equal(true);
  });

  it("rejects a signer scoped to a DIFFERENT thread, and a signer of a DIFFERENT user", async () => {
    const u = await newUser();
    const postX = randomUUID();
    const postY = randomUUID();
    const personaX = await registerThread(u, postX);
    const personaY = await registerThread(u, postY);
    const dev = await enrollDevice(u);
    const sX = await registerSigner(u, dev, postX); // scoped to thread X only
    await actDevice(u, sX, personaX, { type: "post", entityId: postX, content: { body: "x" } });
    const sYsigner = await registerSigner(u, dev, postY);
    await actDevice(u, sYsigner, personaY, { type: "post", entityId: postY, content: { body: "y" } });

    // use thread-X's signer to sign on thread Y (author = personaY) ⇒ thread mismatch ⇒ rejected
    expect(await rejects(actDevice(u, sX, personaY, { type: "comment", entityId: randomUUID(), parent: { type: "post", id: postY }, content: { body: "wrong-thread" } }))).to.equal(true);

    // a DIFFERENT user's signer cannot act for u's persona ⇒ user mismatch ⇒ rejected
    const mallory = await newUser();
    const mDev = await enrollDevice(mallory);
    const mSigner = await registerSigner(mallory, mDev, postX); // registered to mallory
    expect(await rejects(actDevice(u, mSigner, personaX, { type: "comment", entityId: randomUUID(), parent: { type: "post", id: postX }, content: { body: "hijack" } }))).to.equal(true);
  });

  it("rejects an envelope carrying a ZK membership proof (reserved Method-4 slot)", async () => {
    const u = await newUser();
    const postId = randomUUID();
    const persona = await registerThread(u, postId);
    const dev = await enrollDevice(u);
    const s = await registerSigner(u, dev, postId);
    expect(await rejects(actDevice(u, s, persona, { type: "post", entityId: postId, content: { body: "p" }, proof: "deadbeef".repeat(8) }))).to.equal(true);
  });

  it("requireDeviceSigner: a gated service rejects a persona-signed envelope with no device signer", async () => {
    const gated = new RecordService(new PublicChain(store, randomUUID()), store, {
      platformBindingPrivKeyHex: platformPriv, signedEnvelopeMaxAgeSec: 0, requireDeviceSigner: true,
    });
    const u = await newUser();
    const postId = randomUUID();
    const persona = await registerThread(u, postId);
    const txId = randomUUID();
    const salt = newSalt();
    const content = { body: "p" };
    // a valid persona-signed envelope (no signerPubkey) — accepted by the default svc, rejected by gated.
    const base: TxEnvelope = {
      v: 1, txId, type: "post", entityId: postId, op: "create",
      authorPubkey: persona, signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content }),
    };
    // sign with the persona key directly (the single-device / passkey-sync path)
    const { privKey } = deriveThreadKey({ jurisdictionMaster: u.lm, threadId: postId, jurisdiction });
    const { envelope } = signEnvelope(base, privKey);
    expect(await rejects(gated.appendSigned({ envelope, salt, content }))).to.equal(true);
  });

  it("vote across devices: A votes, B changes it (carry-forward nullifier); B's NEW vote is rejected", async () => {
    const u = await newUser();
    const pollId = randomUUID();
    const persona = await registerThread(u, pollId);
    const devA = await enrollDevice(u);
    const devB = await enrollDevice(u);
    const sA = await registerSigner(u, devA, pollId);
    const sB = await registerSigner(u, devB, pollId);
    await actDevice(u, sA, persona, { type: "poll", entityId: pollId, content: { question: "Q?", options: ["yes", "no"], rules: { allowChange: true } } });

    const voteId = randomUUID();
    await actDevice(u, sA, persona, { type: "vote", entityId: voteId, parent: { type: "poll", id: pollId }, content: { option: "yes" } });
    // phone B changes the vote — carry-forward nullifier, accepted
    await actDeviceMutation(sB, persona, { op: "update", type: "vote", entityId: voteId, content: { option: "no" } });
    // phone B casts a NEW vote on the same poll ⇒ the user's nullifier is already active ⇒ rejected
    expect(await rejects(actDevice(u, sB, persona, { type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } }))).to.equal(true);

    await settler.flushPendingSettlement();
    expect((await store.getPollResults(pollId)).find((r) => r.option === "no")!.count).to.equal(1);
    expect((await store.getPollResults(pollId)).find((r) => r.option === "yes")).to.be.undefined;
  });

  it("per-thread anonymity: the same device's signer differs across threads (no cross-thread linker)", () => {
    const root = randomBytes(32);
    const sX = deriveDeviceThreadSigner({ deviceRoot: root, threadId: "thread-X", jurisdiction });
    const sY = deriveDeviceThreadSigner({ deviceRoot: root, threadId: "thread-Y", jurisdiction });
    expect(sX.signerPubkey).to.not.equal(sY.signerPubkey);
    // deterministic per (device, thread)
    const sXagain = deriveDeviceThreadSigner({ deviceRoot: root, threadId: "thread-X", jurisdiction });
    expect(sXagain.signerPubkey).to.equal(sX.signerPubkey);
  });
});
