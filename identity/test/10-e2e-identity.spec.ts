// End-to-end against REAL public-record (Docker Postgres + immudb): the full identity path through
// DevPasskeyConnector + IdentitySession (client) and IdentityRegistry (server) on the mvp-a5b
// persona/signer-split WebAuthn path. Each device has its OWN per-thread WebAuthn passkey
// (`signerPubkey` on every envelope it signs), but ALL of one user's devices share a STABLE thread
// persona Pₜ (`authorPubkey`) — established first-wins at join. That means cross-device edit just
// works: device B can update/delete an entity device A created, because both envelopes carry the
// same Pₜ and `validateUpdate` is a strict pubkey match. The per-(user) nullifier still dedupes
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

describe("10 e2e: DevPasskeyConnector → IdentityRegistry against real public-record (mvp-a5b)", () => {
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

  // sessions for two devices of the same user (each gets its OWN per-thread passkey ⇒ distinct
  // signerPubkeys; the SAME Pₜ on every envelope because join is first-wins per (user, thread)).
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

  /** Join from a device: ensure persona Pₜ + register THIS device's signer credential. Persists the
   *  server-returned Pₜ onto the session before any prepare/submit (envelopes need authorPubkey=Pₜ). */
  async function joinAs(sess: IdentitySession, t: ThreadRef): Promise<string> {
    const { binding } = await sess.bindingInputs(t, { kycTier });
    const resp = await registry.joinThread({
      userId,
      threadId: t.threadId,
      jurisdiction: t.jurisdiction,
      signerPubkey: binding.thread_pubkey,
      commitment: binding.commitment,
      kycTier,
    });
    sess.rememberPersona(t, resp.personaPubkey);
    return resp.personaPubkey;
  }

  /** prepare (authored as Pₜ) → WebAuthn-sign (this device's signer) → submit. */
  async function act(sess: IdentitySession, t: ThreadRef, intent: Intent) {
    const author = sess.personaPubkey(t);
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

  it("join: first device establishes Pₜ; second device receives the SAME Pₜ and gets its own signer row", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, jurisdiction };
    const personaFromA = await joinAs(sessA, t);
    const personaFromB = await joinAs(sessB, t);
    expect(personaFromB).to.equal(personaFromA); // first-wins per (user, thread)

    const signerA = await sessA.signingPubkey(t);
    const signerB = await sessB.signingPubkey(t);
    expect(signerA).to.not.equal(signerB); // distinct devices = distinct signers

    // thread_keys: one row for the persona Pₜ
    const tk = await store!.getThreadKey(personaFromA);
    expect(tk?.threadId).to.equal(postId);
    expect(tk?.userId).to.equal(userId);
    expect(await store!.getThreadBinding(personaFromA)).to.not.equal(null);

    // thread_civic_credentials: a row per device signer, both under Pₜ
    const credA = await store!.getThreadCredential(signerA);
    const credB = await store!.getThreadCredential(signerB);
    expect(credA?.personaPubkey).to.equal(personaFromA);
    expect(credB?.personaPubkey).to.equal(personaFromA);
    expect(credA?.userId).to.equal(userId);
    expect(credB?.userId).to.equal(userId);
    expect(credA?.revoked).to.equal(false);
    expect(credB?.revoked).to.equal(false);
  });

  it("cross-device edit: device B edits device A's post (same Pₜ, different signerPubkey)", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, jurisdiction };
    const personaPubkey = await joinAs(sessA, t);
    await joinAs(sessB, t);

    const ref = await act(sessA, t, { op: "create", type: "post", entityId: postId, content: { body: "v1 from A" } });
    const head = (await store!.getHeadTx(postId))!;
    const env = JSON.parse(head.envelope) as TxEnvelope;
    expect(env.signScheme).to.equal("webauthn-es256");
    expect(env.authorPubkey).to.equal(personaPubkey);
    expect(env.signerPubkey).to.equal(await sessA.signingPubkey(t));

    // Device B updates A's post → ACCEPTED (cross-device edit under stable Pₜ).
    await act(sessB, t, { op: "update", type: "post", entityId: postId, content: { body: "v2 from B" } });
    const head2 = (await store!.getHeadTx(postId))!;
    const env2 = JSON.parse(head2.envelope) as TxEnvelope;
    expect(env2.authorPubkey).to.equal(personaPubkey);
    expect(env2.signerPubkey).to.equal(await sessB.signingPubkey(t));
    expect(head2.authorPubkey).to.equal(personaPubkey);

    const state = await store!.getEntityStatePublic(postId);
    expect(state?.content).to.deep.equal({ body: "v2 from B" });

    await settler.flushPendingSettlement();
    expect((await connector!.verifyRow(ref.txId)).verified).to.equal(true);
  });

  it("revoked signer cannot append, but a sibling signer under the same Pₜ still can", async () => {
    const postId = randomUUID();
    const t: ThreadRef = { threadId: postId, jurisdiction };
    await joinAs(sessA, t);
    await joinAs(sessB, t);
    await act(sessA, t, { op: "create", type: "post", entityId: postId, content: { body: "v1" } });

    // Revoke device A's signer → A can no longer append.
    const signerA = await sessA.signingPubkey(t);
    await store!.revokeThreadCredential(signerA);
    expect(
      await rejects(act(sessA, t, { op: "update", type: "post", entityId: postId, content: { body: "v2 from A" } })),
    ).to.equal(true);

    // Device B (not revoked, same Pₜ) can still edit the post.
    await act(sessB, t, { op: "update", type: "post", entityId: postId, content: { body: "v2 from B" } });
    const state = await store!.getEntityStatePublic(postId);
    expect(state?.content).to.deep.equal({ body: "v2 from B" });
  });

  it("vote: A votes; A cannot vote twice, and B's vote on the same poll is rejected (per-user nullifier holds cross-device)", async () => {
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
    // B (distinct signer, SAME user, SAME Pₜ) votes on the same poll ⇒ shared nullifier root ⇒ rejected.
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
    const prep = await registry.prepare(intent, sessA.personaPubkey(t));
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
