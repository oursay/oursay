// Phase-1c client quick-sign through the REAL SDK ([align-w3-gates-schema] sign floors). The
// 20-gates spec pinned the SERVER contract by hand-building a p256 envelope; this spec proves the
// @oursay/identity CLIENT produces exactly that envelope end-to-end over HTTP:
//   CivicHttpClient.append(…, { sign: "quick" }) → ensureQuickSigner (join enrolls the soft
//   per-thread P-256 key — no per-thread WebAuthn ceremony) → prepare →
//   IdentitySession.buildQuickSigned (no WebAuthn ceremony) → submit 201.
// Also: cross-scheme singleton dedupe (the shared nullifier root spans quick + passkey), quick
// updates (carry-forward nullifier), AB statements accepting the SDK quick path (passkey optional),
// and the AB petition passkey floor rejecting quick with the same machine-readable
// `passkey_required` lock-state reason the UI keys off.

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1"; // dev passkey custody is env-guarded; set before first construct.

import { CivicHttpClient, CivicHttpError, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { ThreadRef } from "@oursay/identity";
import { jurisdictions } from "@oursay/jurisdiction-data";
import { registerJurisdiction } from "@oursay/public-record";
import type { TxEnvelope } from "@oursay/public-record";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";
import { fullSessionAccount } from "./helpers/account.js";

const AB = "ab-ca-gov";
const GLOBAL = "oursay-global";

interface Member {
  userId: string;
  token: string;
  sess: IdentitySession;
  client: CivicHttpClient;
}

/** Enroll a device + join the GIVEN thread through the SDK (same harness shape as 20-gates). */
async function joinMember(w: World, email: string, seed: string, t: ThreadRef): Promise<Member> {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-quick-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t);
  return { userId, token, sess, client };
}

function threadIn(jurisdiction: string): ThreadRef {
  return { threadId: randomUUID(), jurisdiction };
}

async function rejects(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
}

describe("21 quick-sign SDK: CivicHttpClient sign:'quick' produces the pinned p256 server contract", () => {
  let w: World;

  before(async function () {
    this.timeout(60000);
    w = await resetWorld();
    // Order-independence: other suites strip-and-restore gate configs around themselves.
    for (const j of jurisdictions) registerJurisdiction(j);
  });

  it("global: quick-only join never mints a per-thread WebAuthn credential", async function () {
    this.timeout(60000);
    const t = threadIn(GLOBAL);
    const author = await joinMember(w, "q21-qonly-author@example.com", "q21-qoa", t);
    await author.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Q?", options: ["yes", "no"] } });

    const { userId, token } = await fullSessionAccount(w, "q21-qonly-voter@example.com");
    const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-qonly-")), seed: "q21-qov" });
    await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
    const unlocked = await passkey.unlock({ userId, deviceId: "A" });
    const sess = new IdentitySession(unlocked);
    const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });

    expect(unlocked.threadSigningPubkey(t.threadId)).to.equal(null);
    await client.castVote(t, { type: "poll", id: t.threadId }, { option: "yes" }, { sign: "quick" });
    // First join for this user on the thread — Pₜ is the offered quick signer (distinct from the author's Pₜ).
    expect(sess.personaPubkey(t)).to.equal(sess.quickSigningPubkey(t));
    expect(unlocked.threadSigningPubkey(t.threadId)).to.equal(null);
  });

  it("global: a quick vote settles end-to-end; the soft signer is enrolled under the WebAuthn Pₜ", async function () {
    this.timeout(60000);
    const t = threadIn(GLOBAL);
    const author = await joinMember(w, "q21-author@example.com", "q21-author", t);
    await author.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Quick?", options: ["yes", "no"] } });

    const voter = await joinMember(w, "q21-voter@example.com", "q21-voter", t);
    const ref = await voter.client.castVote(t, { type: "poll", id: t.threadId }, { option: "yes" }, { sign: "quick" });

    // The envelope on the record is the pinned contract: author = Pₜ (the WebAuthn signer's
    // first-join allocation), signer = the SOFT key, signScheme absent ⇒ p256 (sign_tier 0).
    const head = (await w.services.recordStore.getHeadTx(ref.entityId))!;
    const stored = JSON.parse(head.envelope) as TxEnvelope;
    expect(head.authorPubkey).to.equal(voter.sess.personaPubkey(t));
    expect(stored.signerPubkey).to.equal(voter.sess.quickSigningPubkey(t));
    expect(stored.signerPubkey).to.not.equal(await voter.sess.signingPubkey(t));
    expect(stored.signScheme ?? "p256").to.equal("p256");
    expect(stored.webauthn).to.equal(undefined);
    expect(head.content).to.deep.equal({ option: "yes" });

    // ensureQuickSigner landed the soft key as an ADDITIONAL credential row under the same Pₜ.
    const cred = await w.services.recordStore.getThreadCredential(voter.sess.quickSigningPubkey(t));
    expect(cred, "quick civic credential").to.not.equal(null);
    expect(cred!.userId).to.equal(voter.userId);
    expect(cred!.personaPubkey).to.equal(voter.sess.personaPubkey(t));
    expect(cred!.revoked).to.equal(false);

    // The C6 relationship snapshot is scheme-independent — it landed for the quick path too.
    const snap = await w.services.recordStore.getRecordActionGeo(ref.txId);
    expect(snap, "record_action_geo snapshot").to.not.equal(null);
    expect(snap!.tierAtAction).to.equal("unverified");
  });

  it("cross-scheme singleton dedupe: after a quick vote, a passkey vote on the same poll is rejected", async function () {
    this.timeout(60000);
    const t = threadIn(GLOBAL);
    const author = await joinMember(w, "q21-dedupe-author@example.com", "q21-da", t);
    await author.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Once?", options: ["yes", "no"] } });

    const voter = await joinMember(w, "q21-dedupe-voter@example.com", "q21-dv", t);
    await voter.client.castVote(t, { type: "poll", id: t.threadId }, { option: "yes" }, { sign: "quick" });

    // Same user, same poll, OTHER scheme: the shared per-(user, jurisdiction) nullifier root makes
    // this the same nullifier — the singleton guard must reject the second create.
    const err = await rejects(voter.client.castVote(t, { type: "poll", id: t.threadId }, { option: "no" }));
    expect(err, "second vote must be rejected").to.be.instanceOf(CivicHttpError);
  });

  it("quick update: the quick path edits its own vote via the carry-forward nullifier", async function () {
    this.timeout(60000);
    const t = threadIn(GLOBAL);
    const author = await joinMember(w, "q21-upd-author@example.com", "q21-ua", t);
    await author.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Change?", options: ["yes", "no"], rules: { allowChange: true } } });

    const voter = await joinMember(w, "q21-upd-voter@example.com", "q21-uv", t);
    const ref = await voter.client.castVote(t, { type: "poll", id: t.threadId }, { option: "yes" }, { sign: "quick" });
    await voter.client.append(t, { op: "update", type: "vote", entityId: ref.entityId, content: { option: "no" } }, { sign: "quick" });

    const head = (await w.services.recordStore.getHeadTx(ref.entityId))!;
    expect(head.content).to.deep.equal({ option: "no" });
    expect((JSON.parse(head.envelope) as TxEnvelope).signScheme ?? "p256").to.equal("p256");
  });

  it("AB: the SDK quick path succeeds on a statement (passkey optional)", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "q21-ab-stmt@example.com", "q21-abs", t);
    const ref = await m.client.createPost(t, { title: "Test post", body: "quick ok" }, { sign: "quick" });
    expect(ref.entityId).to.equal(t.threadId);
    const head = (await w.services.recordStore.getHeadTx(ref.entityId))!;
    expect((JSON.parse(head.envelope) as TxEnvelope).signScheme ?? "p256").to.equal("p256");
  });

  it("AB: the SDK quick path is floor-blocked on a petition (403 passkey_required — same lock-state contract)", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "q21-ab-floor@example.com", "q21-abf", t);
    await w.services.kycService.attest(m.userId, "residency_verified");
    const err = (await rejects(
      m.client.append(t, { op: "create", type: "petition", entityId: t.threadId, content: { title: "Test petition", text: "quick?" } }, { sign: "quick" }),
    )) as CivicHttpError | null;
    expect(err, "quick petition in AB must be rejected").to.be.instanceOf(CivicHttpError);
    expect(err!.status).to.equal(403);
    const details = (err!.body as { error: { details: Record<string, unknown> } }).error.details;
    expect(details.reason).to.equal("passkey_required");
    expect(details.action).to.equal("petition");
    expect(details.jurisdictionId).to.equal(AB);
  });

  it("quick-then-passkey: passkey comment succeeds after quick reaction on the same thread", async function () {
    this.timeout(60000);
    const t = threadIn(GLOBAL);
    const author = await joinMember(w, "q21-qp-author@example.com", "q21-qpa", t);
    await author.client.createPost(t, { title: "Thread", body: "for quick-then-passkey" });

    const { userId, token } = await fullSessionAccount(w, "q21-qp-user@example.com");
    const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-qp-")), seed: "q21-qpu" });
    await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
    const unlocked = await passkey.unlock({ userId, deviceId: "A" });
    const sess = new IdentitySession(unlocked);
    const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });

    expect(unlocked.threadSigningPubkey(t.threadId)).to.equal(null);
    await client.addReaction(t, { type: "post", id: t.threadId }, { kind: "check" }, { sign: "quick" });

    const pt = sess.personaPubkey(t);
    const quickSigner = sess.quickSigningPubkey(t);
    const quickCred = await w.services.recordStore.getThreadCredential(quickSigner);
    expect(quickCred).to.not.equal(null);
    expect(quickCred!.personaPubkey).to.equal(pt);

    const ref = await client.createComment(
      t,
      { type: "post", id: t.threadId },
      { body: "passkey after quick" },
      { sign: "passkey" },
    );
    expect(ref.entityId).to.be.a("string");

    const passkeySigner = await sess.signingPubkey(t);
    const passkeyCred = await w.services.recordStore.getThreadCredential(passkeySigner);
    expect(passkeyCred).to.not.equal(null);
    expect(passkeyCred!.personaPubkey).to.equal(pt);
    expect(passkeySigner).to.not.equal(quickSigner);
  });
});
