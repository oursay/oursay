// End-to-end against REAL public-record (Docker Postgres + immudb): the full identity path through
// DevPasskeyConnector + IdentitySession (client) and IdentityRegistry (server) on the per-thread
// WebAuthn (Option A) path. Each device has its OWN thread passkey, so two devices are two distinct
// authors in a thread (the documented cross-device tradeoff); the per-(user) nullifier still dedupes
// singletons across the user's devices. Requires `npm run db:up --workspace public-record` and
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
  immudbPgConfig,
  pgConfig,
} from "@oursay/public-record";
import type { TxEnvelope } from "@oursay/public-record/schema/types";
import { DevPasskeyConnector } from "../src/client/dev-connector.js";
import { IdentitySession } from "../src/client/session.js";
import { IdentityRegistry } from "../src/server/registry.js";
import type { Intent, ThreadRef } from "../src/shared/types.js";

process.env.OURSAY_DEV_PASSKEY = "1";

describe("10 e2e: DevPasskeyConnector → IdentityRegistry against real public-record (Option A)", () => {
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const jurisdiction = "ab-ca-gov";
  const kycTier = "residency_verified";

  let store: PrivateStore | undefined;
  let connector: PgWireLedgerConnector | undefined;
  let settler: BlockSettler;
  let registry: IdentityRegistry;
  let passkey: DevPasskeyConnector;
  let devDir: string;
  let userId: string;

  // sessions for two devices of the same user (each gets its OWN per-thread passkey)
  let sessA: IdentitySession;
  let sessB: IdentitySession;

  before(async () => {
    connector = new PgWireLedgerConnector(immudbPgConfig);
    await connector.connect();
    store = new PrivateStore(pgConfig);
    await store.init();
    await store.reset();
    const chainId = randomUUID();
    const svc = new RecordService(new PublicChain(store, chainId), store, {
      platformBindingPrivKeyHex: platformPriv,
      signedEnvelopeMaxAgeSec: 0,
    });
    settler = new BlockSettler(store, connector, chainId, blockConfig);
    registry = new IdentityRegistry({ store, svc, platformBindingPrivKeyHex: platformPriv });

    devDir = mkdtempSync(join(tmpdir(), "oursay-e2e-"));
    passkey = new DevPasskeyConnector({ rootDir: devDir, seed: "e2e" });

    userId = randomUUID();
    await registry.ensureUser({ userId });
    await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
    await passkey.enrollDevice({ userId, deviceId: "B", label: "phone B" });
    sessA = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
    sessB = new IdentitySession(await passkey.unlock({ userId, deviceId: "B" }));
  });

  /** Join a thread from a device session: create its thread passkey + register the binding/credential. */
  async function joinAs(sess: IdentitySession, t: ThreadRef) {
    const { binding } = await sess.bindingInputs(t, { kycTier });
    await registry.joinThread({
      userId,
      threadId: t.threadId,
      jurisdiction: t.jurisdiction,
      personaPubkey: binding.thread_pubkey,
      commitment: binding.commitment,
      kycTier,
    });
  }

  /** prepare → WebAuthn-sign → submit. */
  async function act(sess: IdentitySession, t: ThreadRef, intent: Intent) {
    const author = await sess.authorPubkey(t);
    const prep = await registry.prepare(intent, author);
    return registry.submit(await sess.buildSigned(t, prep, intent));
  }

  async function rejects(p: Promise<unknown>): Promise<boolean> {
    try {
      await p;
      return false;
    } catch {
      return true;
    }
  }

  it("join writes thread_keys + thread_bindings + the per-thread civic credential; devices are distinct authors", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, jurisdiction };
    await joinAs(sessA, t);
    await joinAs(sessB, t);

    const authorA = await sessA.authorPubkey(t);
    const authorB = await sessB.authorPubkey(t);
    expect(authorA).to.not.equal(authorB); // Option A: one credential per (device, thread)

    const tk = await store!.getThreadKey(authorA);
    expect(tk?.threadId).to.equal(postId);
    expect(await store!.getThreadBinding(authorA)).to.not.equal(null);
    const cred = await store!.getThreadCredential(authorA);
    expect(cred?.userId).to.equal(userId);
    expect(cred?.revoked).to.equal(false);
  });

  it("device A creates a post; device B (a distinct passkey) cannot edit A's post, but can post its own", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, jurisdiction };
    await joinAs(sessA, t);
    await joinAs(sessB, t);

    const ref = await act(sessA, t, { op: "create", type: "post", entityId: postId, content: { body: "v1" } });
    const head = (await store!.getHeadTx(postId))!;
    const env = JSON.parse(head.envelope) as TxEnvelope;
    expect(env.signScheme).to.equal("webauthn-es256");
    expect(env.signerPubkey).to.equal(undefined);
    expect(head.authorPubkey).to.equal(await sessA.authorPubkey(t));

    // phone B edits phone A's post → rejected: different thread passkey ⇒ different author.
    expect(await rejects(act(sessB, t, { op: "update", type: "post", entityId: postId, content: { body: "from B" } }))).to.equal(true);
    // phone B can still author its own comment.
    await act(sessB, t, { op: "create", type: "comment", entityId: randomUUID(), parent: { type: "post", id: postId }, content: { body: "B's comment" } });

    await settler.flushPendingSettlement();
    expect((await connector!.verifyRow(ref.txId)).verified).to.equal(true);
  });

  it("vote: A votes; A cannot vote twice, and B's vote on the same poll is rejected (per-user nullifier)", async () => {
    const pollId = randomUUID();
    const t: ThreadRef = { threadId: pollId, jurisdiction };
    await joinAs(sessA, t);
    await joinAs(sessB, t);
    await act(sessA, t, { op: "create", type: "poll", entityId: pollId, content: { question: "Q?", options: ["yes", "no"], rules: { allowChange: true } } });

    const voteId = randomUUID();
    await act(sessA, t, { op: "create", type: "vote", entityId: voteId, parent: { type: "poll", id: pollId }, content: { option: "yes" } });
    // A changes A's own vote (governance permits; carry-forward nullifier).
    await act(sessA, t, { op: "update", type: "vote", entityId: voteId, content: { option: "no" } });
    // A casts a NEW vote ⇒ A's nullifier already active ⇒ rejected.
    expect(await rejects(act(sessA, t, { op: "create", type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } }))).to.equal(true);
    // B (distinct passkey, SAME user) votes on the same poll ⇒ the user's nullifier is active ⇒ rejected.
    expect(await rejects(act(sessB, t, { op: "create", type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } }))).to.equal(true);

    await settler.flushPendingSettlement();
    expect((await store!.getPollResults(pollId)).find((r) => r.option === "no")!.count).to.equal(1);
    expect((await store!.getPollResults(pollId)).find((r) => r.option === "yes")).to.equal(undefined);
  });

  it("a webauthn-es256 envelope stripped of its assertion is rejected on the verified path", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, jurisdiction };
    await joinAs(sessA, t);
    await act(sessA, t, { op: "create", type: "post", entityId: postId, content: { body: "v1" } });

    // Build a valid submission, then strip the webauthn assertion → must be rejected.
    const intent: Intent = { op: "create", type: "comment", entityId: randomUUID(), parent: { type: "post", id: postId }, content: { body: "x" } };
    const prep = await registry.prepare(intent, await sessA.authorPubkey(t));
    const good = await sessA.buildSigned(t, prep, intent);
    const { webauthn, ...envNoWa } = good.envelope;
    void webauthn;
    expect(await rejects(registry.submit({ envelope: envNoWa as TxEnvelope, salt: good.salt, content: good.content }))).to.equal(true);
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
