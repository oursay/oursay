// Civic record WRITE path (docs/08 §6; public-record R1/R2/R7) over HTTP, mvp-a5b persona/signer
// split. The golden path: a member joins a thread (creating THIS device's per-thread WebAuthn
// passkey under a stable thread persona Pₜ), prepares an append, the client WebAuthn-signs it
// (envelope's authorPubkey=Pₜ, signerPubkey=this device's passkey pubkey), and the signed envelope
// is submitted into the verified record pool. Cross-device edit just works: a second device of the
// same user receives the SAME Pₜ at join and edits the first device's entities. The happy paths
// drive the real @oursay/identity CivicHttpClient SDK (DevPasskeyConnector simulating WebAuthn +
// IdentitySession over an inject-backed fetch) — no mocks, the same orchestration + crypto a
// browser would run. Ownership/auth negatives keep tampering at the raw HTTP layer to assert
// security properties.

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1"; // dev passkey custody is env-guarded; set before first construct.

import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { Intent, ThreadRef } from "@oursay/identity";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";
const JURISDICTION = "ab-ca-gov";
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const validJoin = () => ({ threadId: randomUUID(), jurisdiction: JURISDICTION, signerPubkey: "02".padEnd(66, "a"), commitment: "a".repeat(64) });

async function fullSessionAccount(w: World, email: string): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  await w.services.repos.user.create({ id: userId, handle: `@u${userId.slice(0, 8)}` });
  await w.services.repos.profile.insert({
    userId, firstName: null, lastName: null,
    line1: null, line2: null, city: null, province: "AB", postalCode: null, country: "CA",
    memo: null, birthdate: ADULT_DOB, email, emailCanonical: email.toLowerCase(),
  });
  const session = await w.services.authService.issue(userId, "full", "test");
  return { userId, token: session.token };
}

interface Member {
  userId: string;
  token: string;
  sess: IdentitySession;
  client: CivicHttpClient;
  passkey: DevPasskeyConnector;
  threadId: string;
  t: ThreadRef;
}

/** Unlock a signing session and join a fresh thread — all through the CivicHttpClient SDK. The
 *  join creates THIS device's WebAuthn passkey, registers its signerPubkey under Pₜ, and persists
 *  Pₜ onto the session. Returns the pieces a test needs. */
async function enrolledMember(w: World, email: string, seed: string): Promise<Member> {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-civic-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const threadId = randomUUID();
  const t: ThreadRef = { threadId, jurisdiction: JURISDICTION };

  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t); // creates the device's thread passkey + registers signer under Pₜ

  return { userId, token, sess, client, passkey, threadId, t };
}

/** Enroll a SECOND device for an existing member under the SAME (userId, token) and join the same
 *  thread. The server returns the same Pₜ; the SDK persists it onto the second session so envelopes
 *  carry authorPubkey=Pₜ with a different signerPubkey. */
async function enrolledSecondDevice(w: World, m: Member, seed: string, deviceId: string): Promise<IdentitySession & { client: CivicHttpClient }> {
  // Use the SAME passkey custody dir so the deterministic userRoot/jurisdictionMaster match — that
  // makes both devices compute the same binding `salt_t`, which is what lets the server's
  // commitment-match guard on second-device join pass.
  await m.passkey.enrollDevice({ userId: m.userId, deviceId, label: `phone ${deviceId}` });
  const sess = new IdentitySession(await m.passkey.unlock({ userId: m.userId, deviceId }));
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token: m.token, fetch: injectFetch(w.app) });
  await client.ensureJoined(m.t);
  return Object.assign(sess, { client });
}

describe("12 civic record: join → prepare → WebAuthn-sign → submit (mvp-a5b persona/signer split)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("golden path: a joined member posts a Belief that lands in the record pool; join returns Pₜ", async () => {
    const m = await enrolledMember(w, "civic-record@example.com", "golden");

    // One SDK call orchestrates prepare → WebAuthn-sign → submit.
    const ref = await m.client.createPost(m.t, { title: "Test post", body: "hello alberta" });
    expect(ref.entityId).to.equal(m.threadId);

    const head = await w.services.recordStore.getHeadTx(m.threadId);
    expect(head, "pooled head tx").to.not.equal(undefined);
    expect(head!.op).to.equal("create");
    expect(head!.content).to.deep.equal({ title: "Test post", body: "hello alberta" });
    // authorPubkey on the appended row is Pₜ (= the session's persona for this thread).
    expect(head!.authorPubkey).to.equal(m.sess.personaPubkey(m.t));

    const pool = await w.services.recordStore.getPendingPoolStats(JURISDICTION);
    expect(pool.count).to.be.greaterThan(0);
  });

  it("rejects a post create with a missing or over-length title at prepare (400)", async () => {
    const m = await enrolledMember(w, "civic-content@example.com", "content");
    const author = m.sess.personaPubkey(m.t);
    const prepare = (intent: Intent) =>
      w.app.inject({ method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token), payload: { author, intent } });

    const noTitle: Intent = { op: "create", type: "post", entityId: m.threadId, content: { body: "no title" } };
    const longTitle: Intent = { op: "create", type: "post", entityId: m.threadId, content: { title: "x".repeat(201) } };

    expect((await prepare(noTitle)).statusCode).to.equal(400);
    expect((await prepare(longTitle)).statusCode).to.equal(400);
  });

  it("join returns 200 + { personaPubkey } (not 204) and the canonical Pₜ", async () => {
    const { userId, token } = await fullSessionAccount(w, "civic-200@example.com");
    const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-civic-")), seed: "p200" });
    await passkey.enrollDevice({ userId, deviceId: "A" });
    const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
    const t: ThreadRef = { threadId: randomUUID(), jurisdiction: JURISDICTION };
    const { binding } = await sess.bindingInputs(t);

    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/threads/join", headers: bearer(token),
      payload: { threadId: t.threadId, jurisdiction: t.jurisdiction, signerPubkey: binding.thread_pubkey, commitment: binding.commitment },
    });
    expect(res.statusCode).to.equal(200);
    const body = res.json() as { personaPubkey: string };
    expect(body.personaPubkey).to.equal(binding.thread_pubkey); // first device wins ⇒ persona = its signer
  });

  it("second device join returns the SAME Pₜ as the first device", async () => {
    const m = await enrolledMember(w, "civic-2nd@example.com", "two");
    const personaA = m.sess.personaPubkey(m.t);

    const sessB = await enrolledSecondDevice(w, m, "two", "B");
    const personaB = sessB.personaPubkey(m.t);
    expect(personaB).to.equal(personaA);
    // Distinct signers per device.
    expect(await sessB.signingPubkey(m.t)).to.not.equal(await m.sess.signingPubkey(m.t));
  });

  it("cross-device edit (HTTP path): device B updates device A's post (201)", async () => {
    const m = await enrolledMember(w, "civic-xdev@example.com", "xdev");
    const ref = await m.client.createPost(m.t, { title: "Test post", body: "v1 from A" });
    expect(ref.entityId).to.equal(m.threadId);

    const sessB = await enrolledSecondDevice(w, m, "xdev", "B");
    const refB = await sessB.client.append(m.t, { op: "update", type: "post", entityId: m.threadId, content: { title: "Test post", body: "v2 from B" } });
    expect(refB.entityId).to.equal(m.threadId);
    const head = await w.services.recordStore.getHeadTx(m.threadId);
    expect(head!.content).to.deep.equal({ title: "Test post", body: "v2 from B" });
    expect(head!.authorPubkey).to.equal(m.sess.personaPubkey(m.t)); // still Pₜ
  });

  it("revoked signer is forbidden (403); a sibling signer under the same Pₜ still posts", async () => {
    const m = await enrolledMember(w, "civic-revoke@example.com", "revoke");
    const sessB = await enrolledSecondDevice(w, m, "revoke", "B");
    await m.client.createPost(m.t, { title: "Test post", body: "v1 from A" });

    // Revoke device A's signer credential on the server.
    const signerA = await m.sess.signingPubkey(m.t);
    await w.services.recordStore.revokeThreadCredential(signerA);

    const intent: Intent = { op: "update", type: "post", entityId: m.threadId, content: { title: "Test post", body: "v2 from A (revoked)" } };
    const prep = await w.app.inject({ method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token), payload: { author: m.sess.personaPubkey(m.t), intent } });
    expect(prep.statusCode).to.equal(200);
    const signed = await m.sess.buildSigned(m.t, prep.json() as never, intent);
    const res = await w.app.inject({ method: "POST", url: "/v1/civic/appends/submit", headers: bearer(m.token), payload: { envelope: signed.envelope, salt: signed.salt, content: signed.content } });
    expect(res.statusCode).to.equal(403);

    // Device B (not revoked) can still edit under the same Pₜ.
    const refB = await sessB.client.append(m.t, { op: "update", type: "post", entityId: m.threadId, content: { title: "Test post", body: "v2 from B" } });
    expect(refB.entityId).to.equal(m.threadId);
  });

  it("supports a comment under a post (attachment with server-derived parent fields)", async () => {
    const m = await enrolledMember(w, "civic-comment@example.com", "comment");
    await m.client.createPost(m.t, { title: "Test post", body: "root" });

    const ref = await m.client.createComment(m.t, { type: "post", id: m.threadId }, { body: "a reply" });
    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.content).to.deep.equal({ body: "a reply" });
  });

  it("supports a reaction on a post (signed singleton attachment)", async () => {
    const m = await enrolledMember(w, "civic-react@example.com", "react");
    await m.client.createPost(m.t, { title: "Test post", body: "root" });

    const ref = await m.client.addReaction(m.t, { type: "post", id: m.threadId }, { kind: "check" });
    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.content).to.deep.equal({ kind: "check" });
  });

  it("supports a vote on a poll (the policy-forced webauthn-es256 type, end to end)", async () => {
    const m = await enrolledMember(w, "civic-vote@example.com", "vote");
    await m.client.append(m.t, { op: "create", type: "poll", entityId: m.threadId, content: { question: "Fix the road?", options: ["yes", "no"] } });

    const ref = await m.client.castVote(m.t, { type: "poll", id: m.threadId }, { option: "yes" });
    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.type).to.equal("vote");
    expect(head!.content).to.deep.equal({ option: "yes" });
  });

  it("rejects join without a session (401)", async () => {
    const res = await w.app.inject({ method: "POST", url: "/v1/civic/threads/join", payload: validJoin() });
    expect(res.statusCode).to.equal(401);
  });

  it("rejects join from a limited (recovery) session (403)", async () => {
    const userId = randomUUID();
    await w.services.repos.user.create({ id: userId, handle: `@u${userId.slice(0, 8)}` });
    await w.services.repos.profile.insert({
      userId, firstName: null, lastName: null,
      line1: null, line2: null, city: null, province: "AB", postalCode: null, country: "CA",
      memo: null, birthdate: ADULT_DOB, email: "civic-rec@example.com", emailCanonical: "civic-rec@example.com",
    });
    const limited = await w.services.authService.issue(userId, "recovery", "test");
    const res = await w.app.inject({ method: "POST", url: "/v1/civic/threads/join", headers: bearer(limited.token), payload: validJoin() });
    expect(res.statusCode).to.equal(403);
  });

  it("rejects a submission whose author persona belongs to another account (forbidden)", async () => {
    const a = await enrolledMember(w, "civic-sign-a@example.com", "sign-a");
    const b = await enrolledMember(w, "civic-sign-b@example.com", "sign-b");
    const intent: Intent = { op: "create", type: "post", entityId: a.threadId, content: { title: "Test post", body: "a's post" } };

    // A prepares + WebAuthn-signs with A's session, but B submits it under B's token.
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(a.token),
      payload: { author: a.sess.personaPubkey(a.t), intent },
    });
    expect(prep.statusCode).to.equal(200);
    const signed = await a.sess.buildSigned(a.t, prep.json() as never, intent);
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/submit", headers: bearer(b.token),
      payload: { envelope: signed.envelope, salt: signed.salt, content: signed.content },
    });
    expect(res.statusCode).to.equal(403);
  });

  it("rejects a prepare with a non-Pₜ author pubkey (wrong author ⇒ 404)", async () => {
    const m = await enrolledMember(w, "civic-wrongauthor@example.com", "wrongauthor");
    const bogus = "02" + "f".repeat(64); // valid-shaped pubkey, not a registered Pₜ
    const intent: Intent = { op: "create", type: "post", entityId: m.threadId, content: { title: "Test post", body: "x" } };
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token),
      payload: { author: bogus, intent },
    });
    expect(res.statusCode).to.equal(404);
  });

  it("rejects a webauthn envelope stripped of its assertion on the verified path", async () => {
    const m = await enrolledMember(w, "civic-strip@example.com", "strip");
    const intent: Intent = { op: "create", type: "post", entityId: m.threadId, content: { title: "Test post", body: "v1" } };
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token),
      payload: { author: m.sess.personaPubkey(m.t), intent },
    });
    const signed = await m.sess.buildSigned(m.t, prep.json() as never, intent);
    const envelope = { ...signed.envelope } as Record<string, unknown>;
    delete envelope.webauthn;
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/submit", headers: bearer(m.token),
      payload: { envelope, salt: signed.salt, content: signed.content },
    });
    expect(res.statusCode).to.be.oneOf([400, 403]);
  });

  it("rejects a webauthn envelope missing signerPubkey (400)", async () => {
    const m = await enrolledMember(w, "civic-nosigner@example.com", "nosigner");
    const intent: Intent = { op: "create", type: "post", entityId: m.threadId, content: { title: "Test post", body: "v1" } };
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token),
      payload: { author: m.sess.personaPubkey(m.t), intent },
    });
    const signed = await m.sess.buildSigned(m.t, prep.json() as never, intent);
    const envelope = { ...signed.envelope } as Record<string, unknown>;
    delete envelope.signerPubkey;
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/submit", headers: bearer(m.token),
      payload: { envelope, salt: signed.salt, content: signed.content },
    });
    expect(res.statusCode).to.be.oneOf([400, 403]);
  });

  it("petition_signature policy: p256 envelope is rejected (webauthn-es256 hard-required)", async () => {
    const m = await enrolledMember(w, "civic-petsig@example.com", "petsig");
    await m.client.append(m.t, { op: "create", type: "petition", entityId: m.threadId, content: { title: "Fix the road" } });

    // Hand-build a p256-signed petition_signature envelope and submit it. The jurisdiction policy
    // hard-requires webauthn-es256 for this type — the service rejects it outright.
    const intent: Intent = { op: "create", type: "petition_signature", entityId: randomUUID(), parent: { type: "petition", id: m.threadId }, content: {} };
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token),
      payload: { author: m.sess.personaPubkey(m.t), intent },
    });
    expect(prep.statusCode).to.equal(200);
    const prepBody = prep.json() as { prevHash: string | null; parentRevisionHash?: string; nullifierParentId?: string };
    // Build a p256-shaped (no webauthn) envelope manually.
    const envelope = {
      v: 1,
      txId: randomUUID(),
      type: "petition_signature",
      entityId: intent.entityId,
      op: "create" as const,
      parentType: "petition" as const,
      parentId: m.threadId,
      authorPubkey: m.sess.personaPubkey(m.t),
      signature: "00".repeat(64),
      signScheme: "p256" as const,
      createdAt: new Date().toISOString(),
      prevHash: prepBody.prevHash,
      contentHash: "00".repeat(32),
      ...(prepBody.parentRevisionHash ? { parentRevisionHash: prepBody.parentRevisionHash } : {}),
    };
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/submit", headers: bearer(m.token),
      payload: { envelope, salt: "00".repeat(16), content: {} },
    });
    expect(res.statusCode).to.be.oneOf([400, 403]);
  });
});
