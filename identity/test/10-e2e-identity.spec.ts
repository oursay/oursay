// End-to-end against REAL public-record (Docker Postgres + immudb): the full identity path through
// DevPasskeyConnector + IdentitySession (client) and IdentityRegistry (server), on the verified
// `requireDeviceSigner` path. Requires `npm run db:up --workspace public-record` and
// `OURSAY_DEV_PASSKEY=1`.
import { expect } from "chai";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  BlockSettler,
  PgWireLedgerConnector,
  PrivateStore,
  PublicChain,
  RecordService,
  blockConfig,
  contentCommitment,
  deriveThreadKey,
  immudbPgConfig,
  newSalt,
  pgConfig,
  signEnvelope,
} from "@oursay/public-record";
import type { TxEnvelope } from "@oursay/public-record/schema/types";
import { DevPasskeyConnector } from "../src/client/dev-connector.js";
import { IdentitySession } from "../src/client/session.js";
import { IdentityRegistry } from "../src/server/registry.js";
import type { Intent, ThreadRef } from "../src/shared/types.js";

process.env.OURSAY_DEV_PASSKEY = "1";

describe("10 e2e: DevPasskeyConnector → IdentityRegistry against real public-record", () => {
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const level = "federal";
  const kycTier = "residency_verified";
  const region = "ca-ab";

  let store: PrivateStore | undefined;
  let connector: PgWireLedgerConnector | undefined;
  let settler: BlockSettler;
  let registry: IdentityRegistry;
  let passkey: DevPasskeyConnector;
  let devDir: string;
  let userId: string;

  // sessions for two devices of the same user
  let sessA: IdentitySession;
  let sessB: IdentitySession;
  let credA: { devicePubkey: string };
  let credB: { devicePubkey: string };

  before(async () => {
    connector = new PgWireLedgerConnector(immudbPgConfig);
    await connector.connect();
    store = new PrivateStore(pgConfig);
    await store.init();
    await store.reset();
    const chainId = randomUUID();
    const svc = new RecordService(new PublicChain(store, chainId), store, {
      platformBindingPrivKeyHex: platformPriv,
      requireDeviceSigner: true,
      signedEnvelopeMaxAgeSec: 0,
    });
    settler = new BlockSettler(store, connector, chainId, blockConfig);
    registry = new IdentityRegistry({ store, svc, platformBindingPrivKeyHex: platformPriv });

    devDir = mkdtempSync(join(tmpdir(), "oursay-e2e-"));
    passkey = new DevPasskeyConnector({ rootDir: devDir, seed: "e2e" });

    userId = randomUUID();
    await registry.ensureUser({ userId });
    credA = await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
    credB = await passkey.enrollDevice({ userId, deviceId: "B", label: "phone B" });
    await registry.enrollDevice({ userId, devicePubkey: credA.devicePubkey, label: "phone A" });
    await registry.enrollDevice({ userId, devicePubkey: credB.devicePubkey, label: "phone B" });
    sessA = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
    sessB = new IdentitySession(await passkey.unlock({ userId, deviceId: "B" }));
  });

  /** Join a thread from a device session (registers persona binding + that device's signer). */
  async function joinAs(sess: IdentitySession, t: ThreadRef, devicePubkey: string) {
    await registry.joinThread({
      userId,
      threadId: t.threadId,
      level: t.level,
      personaPubkey: sess.personaPubkey(t),
      signerPubkey: sess.signerPubkey(t),
      commitment: sess.bindingInputs(t).binding.commitment,
      devicePubkey,
      kycTier,
      region,
    });
  }

  /** prepare → device-sign → submit. */
  async function act(sess: IdentitySession, t: ThreadRef, intent: Intent) {
    const prep = await registry.prepare(intent, sess.personaPubkey(t));
    return registry.submit(sess.buildSigned(t, prep, intent));
  }

  async function rejects(p: Promise<unknown>): Promise<boolean> {
    try {
      await p;
      return false;
    } catch {
      return true;
    }
  }

  it("enroll writes device_keys for both devices", async () => {
    const da = await store.getDeviceKeyByPubkey(credA.devicePubkey);
    const db = await store.getDeviceKeyByPubkey(credB.devicePubkey);
    expect(da?.userId).to.equal(userId);
    expect(db?.userId).to.equal(userId);
    expect(da!.id).to.not.equal(db!.id);
  });

  it("join thread writes thread_keys + thread_bindings + one thread_signers per device", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, level };
    await joinAs(sessA, t, credA.devicePubkey);
    await joinAs(sessB, t, credB.devicePubkey);

    const persona = sessA.personaPubkey(t);
    expect(sessB.personaPubkey(t)).to.equal(persona); // one persona per (user, thread), both devices
    const tk = await store.getThreadKey(persona);
    expect(tk).to.not.equal(null);
    expect(tk!.threadId).to.equal(postId);
    expect(await store.getThreadBinding(persona)).to.not.equal(null);

    const sgA = await store.getThreadSigner(sessA.signerPubkey(t));
    const sgB = await store.getThreadSigner(sessB.signerPubkey(t));
    expect(sgA?.userId).to.equal(userId);
    expect(sgB?.userId).to.equal(userId);
    expect(sessA.signerPubkey(t)).to.not.equal(sessB.signerPubkey(t)); // thread-scoped per device
  });

  it("device A creates a post + comment; device B edits A's comment (cross-device edit)", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, level };
    await joinAs(sessA, t, credA.devicePubkey);
    await joinAs(sessB, t, credB.devicePubkey);

    const ref = await act(sessA, t, { op: "create", type: "post", entityId: postId, content: { body: "v1" } });
    const head = (await store.getHeadTx(postId))!;
    expect(head.authorPubkey).to.equal(sessA.personaPubkey(t));
    const env = JSON.parse(head.envelope) as TxEnvelope;
    expect(env.signerPubkey).to.equal(sessA.signerPubkey(t));
    expect(env.signerPubkey).to.not.equal(env.authorPubkey);

    const c1 = randomUUID();
    await act(sessA, t, { op: "create", type: "comment", entityId: c1, parent: { type: "post", id: postId }, content: { body: "from A" } });
    // phone B edits phone A's comment — accepted (same user, enrolled device)
    await act(sessB, t, { op: "update", type: "comment", entityId: c1, content: { body: "from B" } });

    expect((await store.getEntityState(c1))!.content).to.deep.equal({ body: "from B" });
    const edited = JSON.parse((await store.getHeadTx(c1))!.envelope) as TxEnvelope;
    expect(edited.authorPubkey).to.equal(sessA.personaPubkey(t)); // persona unchanged
    expect(edited.signerPubkey).to.equal(sessB.signerPubkey(t)); // different device signed

    // settle + confirm the post commitment lands on immudb and server-verifies
    await settler.flushPendingSettlement();
    expect((await connector.verifyRow(ref.txId)).verified).to.equal(true);
  });

  it("vote across devices: A votes, B changes it; B's new vote is rejected", async () => {
    const pollId = randomUUID();
    const t: ThreadRef = { threadId: pollId, level };
    await joinAs(sessA, t, credA.devicePubkey);
    await joinAs(sessB, t, credB.devicePubkey);
    await act(sessA, t, { op: "create", type: "poll", entityId: pollId, content: { question: "Q?", options: ["yes", "no"], rules: { allowChange: true } } });

    const voteId = randomUUID();
    await act(sessA, t, { op: "create", type: "vote", entityId: voteId, parent: { type: "poll", id: pollId }, content: { option: "yes" } });
    await act(sessB, t, { op: "update", type: "vote", entityId: voteId, content: { option: "no" } }); // change, carry-forward nullifier
    // B casts a NEW vote on the same poll ⇒ the user's nullifier is already active ⇒ rejected
    expect(await rejects(act(sessB, t, { op: "create", type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } }))).to.equal(true);

    await settler.flushPendingSettlement();
    expect((await store.getPollResults(pollId)).find((r) => r.option === "no")!.count).to.equal(1);
    expect((await store.getPollResults(pollId)).find((r) => r.option === "yes")).to.equal(undefined);
  });

  it("a persona-only envelope (no device signer) is rejected on the verified path", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, level };
    await joinAs(sessA, t, credA.devicePubkey);
    await act(sessA, t, { op: "create", type: "post", entityId: postId, content: { body: "v1" } });

    // sign a comment with the PERSONA key directly (no signerPubkey) → requireDeviceSigner rejects
    const unlocked = await passkey.unlock({ userId, deviceId: "A" });
    const personaPriv = deriveThreadKey({ levelMaster: unlocked.levelMaster(level), threadId: postId, level }).privKey;
    const txId = randomUUID();
    const salt = newSalt();
    const content = { body: "persona-only" };
    const base: TxEnvelope = {
      v: 1, txId, type: "comment", entityId: randomUUID(), op: "create",
      parentType: "post", parentId: postId,
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content }),
    };
    const { envelope } = signEnvelope(base, personaPriv); // author == signer, no signerPubkey
    expect(await rejects(registry.submit({ envelope, salt, content }))).to.equal(true);
  });

  it("destroyAll() wipes the dev passkey custody (clean slate)", () => {
    passkey.destroyAll();
    expect(existsSync(devDir)).to.equal(false);
  });

  after(async () => {
    await connector?.close?.();
    await store?.close?.();
  });
});
