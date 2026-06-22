import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { bytesToHex } from "@noble/hashes/utils";
import { blockConfig } from "../src/config.js";
import { contentCommitment, newSalt } from "../src/crypto/commitment.js";
import { deriveThreadKey } from "../src/identity/derive.js";
import { signEnvelope } from "../src/identity/envelope.js";
import { buildThreadBindingInputs } from "../src/identity/binding.js";
import { signBinding, platformPublicKey } from "../src/identity/platform-binding.js";
import { verifyThreadBinding } from "../src/identity/verify.js";
import { PublicChain } from "../src/ledger/chain.js";
import { BlockSettler } from "../src/ledger/settler.js";
import type { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import type { PrivateStore } from "../src/private/store.js";
import { RecordService } from "../src/record.js";
import type { TxEnvelope } from "../src/schema/types.js";
import { getWorld, rejects } from "./helpers/world.js";
import { jurisdictionMaster } from "./fixtures/identity-vectors.js";

/**
 * The identity vertical slice end-to-end (Track A): a client derives a per-thread P-256 key, the
 * platform registers a private binding, the client signs a `post` envelope, the server gate
 * (`appendSigned`) verifies signature + binding + commitment, and the action flows through the
 * existing pool → settle path onto immudb. Full offline-bundle verification is covered by suites
 * 08/11; here we assert the commitment lands on the tamper-evident ledger (server verifyRow) and the
 * envelope leaks nothing private.
 */
describe("12 signed append: register → sign → appendSigned → settle (verified-tier post)", () => {
  // Ephemeral platform binding key for this run (env-required in prod; never committed).
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const platformPub = platformPublicKey(platformPriv);
  const jurisdiction = "ab-ca-gov";
  const kycTier = "residency_verified";
  const region = "ca-ab"; // KYC-attestation region (kyc_attestations.region); distinct from jurisdiction

  let store: PrivateStore;
  let connector: PgWireLedgerConnector;
  let chainId: string;
  let svc: RecordService;
  let settler: BlockSettler;

  before(async () => {
    const w = await getWorld();
    store = w.store;
    connector = w.connector;
    await store.reset();
    chainId = randomUUID();
    svc = new RecordService(new PublicChain(store, chainId), store, { platformBindingPubKeyHex: platformPub, signedEnvelopeMaxAgeSec: 0 });
    settler = new BlockSettler(store, connector, chainId, blockConfig);
  });

  /** Register a verified thread for a specific ROOT entity (thread = root). Returns the key + opening. */
  async function registerThreadFor(rootEntityId: string): Promise<{
    userId: string; privKey: Uint8Array; threadPubkey: string; commitment: string; saltT: string;
  }> {
    const userId = randomUUID();
    await store.putUser({ id: userId });
    const jm = jurisdictionMaster();
    // For the slice the jurisdiction master doubles as a P-256 seed so we can record a public master
    // ref; the append gate does not depend on it (it checks the per-thread binding).
    await store.putJurisdictionMaster({ userId, jurisdiction, masterPubkey: bytesToHex(p256.getPublicKey(jm)) });
    const { privKey, threadPubkey } = deriveThreadKey({ jurisdictionMaster: jm, threadId: rootEntityId, jurisdiction });
    const saltT = newSalt();
    const { binding } = buildThreadBindingInputs({ userId, threadPubkey, threadId: rootEntityId, jurisdiction, kycTier, saltT });
    await store.putAttestation({ userId, provider: "dev-stub", tier: kycTier, region });
    await store.registerThreadBinding({
      threadPubkey, userId, threadId: rootEntityId, jurisdiction, kycTier, commitment: binding.commitment, bindingSig: signBinding(binding, platformPriv),
    });
    return { userId, privKey, threadPubkey, commitment: binding.commitment, saltT };
  }

  /** Client-build + sign a root `post` create with a given entityId (= its thread/root id). */
  function buildSignedPost(privKey: Uint8Array, entityId: string, content: unknown): { envelope: TxEnvelope; salt: string; content: unknown } {
    const txId = randomUUID();
    const salt = newSalt();
    const contentHash = contentCommitment({ id: txId, salt, content });
    const base: TxEnvelope = {
      v: 1, txId, type: "post", entityId, op: "create",
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: null, contentHash,
    };
    const { envelope } = signEnvelope(base, privKey);
    return { envelope, salt, content };
  }

  it("DB unit: verifyThreadBinding is true for a registered key, false for an unregistered one", async () => {
    const { threadPubkey } = await registerThreadFor(randomUUID());
    expect(await verifyThreadBinding(store, threadPubkey, platformPub)).to.equal(true);
    expect(await verifyThreadBinding(store, "02" + "ab".repeat(32), platformPub)).to.equal(false);
  });

  it("accepts a verified-tier signed post; the commitment lands on immudb and server-verifies", async () => {
    const entityId = randomUUID();
    const { privKey } = await registerThreadFor(entityId);
    const { envelope, salt, content } = buildSignedPost(privKey, entityId, { title: "Belief", body: "secret civic text" });
    const ref = await svc.appendSigned({ envelope, salt, content });
    await settler.flushPendingSettlement();

    const onchain = await connector.getEnvelope(ref.txId);
    expect(onchain, "row present in immudb").to.exist;
    const v = await connector.verifyRow(ref.txId);
    expect(v.verified).to.equal(true);

    // The on-chain envelope carries the thread pubkey + commitment-to-content, but NOTHING private.
    expect(onchain!).to.include(envelope.authorPubkey); // thread_pubkey
    expect(onchain!).to.include("contentHash");
    expect(onchain!).to.not.include("secret civic text");

    // Postgres holds the plaintext.
    const state = await store.getEntityState(ref.entityId);
    expect(state!.type).to.equal("post");
    expect((state!.content as { body: string }).body).to.equal("secret civic text");
  });

  it("the on-chain envelope carries thread_pubkey only — never the commitment or opening", async () => {
    const entityId = randomUUID();
    const { privKey, userId, commitment, saltT } = await registerThreadFor(entityId);
    const { envelope, salt, content } = buildSignedPost(privKey, entityId, { body: "x" });
    const ref = await svc.appendSigned({ envelope, salt, content });
    await settler.flushPendingSettlement();

    const onchain = await connector.getEnvelope(ref.txId);
    expect(onchain!).to.not.include(commitment);
    expect(onchain!).to.not.include(saltT);
    expect(onchain!).to.not.include(userId);
  });

  it("rejects an unregistered thread key (unverified tier) and writes no pool row", async () => {
    // Derive a key but DO NOT register it.
    const entityId = randomUUID();
    const { privKey } = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: entityId, jurisdiction });
    const { envelope, salt, content } = buildSignedPost(privKey, entityId, { body: "should not land" });
    expect(await rejects(svc.appendSigned({ envelope, salt, content }))).to.equal(true);
    expect(await store.getEntityState(envelope.entityId), "nothing written").to.not.exist;
  });

  it("rejects an invalid signature, a contentHash mismatch, and a non-create op", async () => {
    const entityId = randomUUID();
    const { privKey } = await registerThreadFor(entityId);
    const signed = buildSignedPost(privKey, entityId, { body: "ok" });

    // tampered signature
    const badSig = { ...signed.envelope, signature: signed.envelope.signature.replace(/.$/, (c) => (c === "0" ? "1" : "0")) };
    expect(await rejects(svc.appendSigned({ ...signed, envelope: badSig }))).to.equal(true);

    // contentHash mismatch: change content but keep the signed envelope's hash
    expect(await rejects(svc.appendSigned({ envelope: signed.envelope, salt: signed.salt, content: { body: "different" } }))).to.equal(true);

    // op=update is a supported op (2b), but this still rejects: the post was never committed, so an
    // update finds no head — and an update's prevHash must match the current head (stale ⇒ reject).
    const updateBase: TxEnvelope = { ...signed.envelope, op: "update", authorPubkey: "", signature: "" };
    const updateSigned = signEnvelope(updateBase, privKey).envelope;
    expect(await rejects(svc.appendSigned({ envelope: updateSigned, salt: signed.salt, content: { body: "ok" } }))).to.equal(true);
  });
});
