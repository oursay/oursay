// Civic record WRITE path (docs/08 §6; public-record R1/R2/R7) over HTTP, Option A. The golden path:
// a member joins a thread (creating its per-thread WebAuthn passkey), prepares an append, the client
// WebAuthn-signs it, and the signed envelope is submitted into the verified record pool. The happy
// paths drive the real @oursay/identity CivicHttpClient SDK (DevPasskeyConnector simulating WebAuthn
// + IdentitySession over an inject-backed fetch) — no mocks, the same orchestration + crypto a browser
// would run. Ownership/auth negatives keep tampering at the raw HTTP layer to assert security properties.

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
const validJoin = () => ({ threadId: randomUUID(), jurisdiction: JURISDICTION, personaPubkey: "02".padEnd(66, "a"), commitment: "a".repeat(64) });

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

/** Unlock a signing session and join a fresh thread — all through the CivicHttpClient SDK. The join
 *  creates the thread's WebAuthn passkey (its pubkey is the author). Returns the pieces a test needs. */
async function enrolledMember(w: World, email: string, seed: string) {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-civic-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const threadId = randomUUID();
  const t: ThreadRef = { threadId, jurisdiction: JURISDICTION };

  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t); // creates the thread passkey + registers ownership

  return { userId, token, sess, client, threadId, t };
}

describe("12 civic record: join → prepare → WebAuthn-sign → submit (verified write path)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("golden path: a joined member posts a Belief that lands in the record pool", async () => {
    const m = await enrolledMember(w, "civic-record@example.com", "golden");

    // One SDK call orchestrates prepare → WebAuthn-sign → submit.
    const ref = await m.client.createPost(m.t, { body: "hello alberta" });
    expect(ref.entityId).to.equal(m.threadId);

    const head = await w.services.recordStore.getHeadTx(m.threadId);
    expect(head, "pooled head tx").to.not.equal(undefined);
    expect(head!.op).to.equal("create");
    expect(head!.content).to.deep.equal({ body: "hello alberta" });

    const pool = await w.services.recordStore.getPendingPoolStats(JURISDICTION);
    expect(pool.count).to.be.greaterThan(0);
  });

  it("supports a comment under a post (attachment with server-derived parent fields)", async () => {
    const m = await enrolledMember(w, "civic-comment@example.com", "comment");
    await m.client.createPost(m.t, { body: "root" });

    const ref = await m.client.createComment(m.t, { type: "post", id: m.threadId }, { body: "a reply" });
    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.content).to.deep.equal({ body: "a reply" });
  });

  it("supports a reaction on a post (signed singleton attachment)", async () => {
    const m = await enrolledMember(w, "civic-react@example.com", "react");
    await m.client.createPost(m.t, { body: "root" });

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
    const intent: Intent = { op: "create", type: "post", entityId: a.threadId, content: { body: "a's post" } };

    // A prepares + WebAuthn-signs with A's session, but B submits it under B's token.
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(a.token),
      payload: { author: await a.sess.authorPubkey(a.t), intent },
    });
    expect(prep.statusCode).to.equal(200);
    const signed = await a.sess.buildSigned(a.t, prep.json() as never, intent);
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/submit", headers: bearer(b.token),
      payload: { envelope: signed.envelope, salt: signed.salt, content: signed.content },
    });
    expect(res.statusCode).to.equal(403);
  });

  it("rejects a webauthn envelope stripped of its assertion on the verified path", async () => {
    const m = await enrolledMember(w, "civic-strip@example.com", "strip");
    const intent: Intent = { op: "create", type: "post", entityId: m.threadId, content: { body: "v1" } };
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token),
      payload: { author: await m.sess.authorPubkey(m.t), intent },
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
});
