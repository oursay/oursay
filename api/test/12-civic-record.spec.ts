// Civic record WRITE path (docs/08 §6; public-record R1/R2/R7) over HTTP. The golden path: an
// enrolled civic device joins a thread, prepares an append, the client device-signs it, and the
// signed envelope is submitted into the verified record pool. The happy paths drive the real
// @oursay/identity CivicHttpClient SDK (DevPasskeyConnector + IdentitySession over an inject-backed
// fetch) — no mocks, the same orchestration + crypto a browser would run. Ownership/auth negatives
// keep tampering at the raw HTTP layer (payloads the SDK deliberately hides) to assert the security
// properties.

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

/** Enrol an account + civic device, unlock a signing session, and join a fresh thread — all through
 *  the CivicHttpClient SDK (which replaces the hand-rolled enroll/join inject boilerplate). Returns
 *  the pieces a test needs to act on the thread, including the SDK client. */
async function enrolledMember(w: World, email: string, seed: string) {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-civic-")), seed });
  const cred = await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const threadId = randomUUID();
  const t: ThreadRef = { threadId, jurisdiction: JURISDICTION };

  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  // Enrol the civic device (public.device_keys) and join the thread via the SDK — the same orchestration
  // a browser would run, replacing the raw /v1/civic/devices + /threads/join inject calls.
  await client.ensureDeviceEnrolled("phone A");
  await client.ensureJoined(t);

  return { userId, token, cred, sess, client, threadId, t };
}

describe("12 civic record: join → prepare → sign → submit (verified write path)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("golden path: an enrolled device posts a Belief that lands in the record pool", async () => {
    const m = await enrolledMember(w, "civic-record@example.com", "golden");

    // One SDK call orchestrates prepare → device-sign → submit (the device + thread are already set up).
    const ref = await m.client.createPost(m.t, { body: "hello alberta" });
    expect(ref.entityId).to.equal(m.threadId);

    // The verified write is pooled in the private store (record_tx), content intact.
    const head = await w.services.recordStore.getHeadTx(m.threadId);
    expect(head, "pooled head tx").to.not.equal(undefined);
    expect(head!.op).to.equal("create");
    expect(head!.content).to.deep.equal({ body: "hello alberta" });

    // And it's a pending entry in this chain's settlement pool.
    const pool = await w.services.recordStore.getPendingPoolStats(JURISDICTION);
    expect(pool.count).to.be.greaterThan(0);
  });

  it("supports a comment under a post (attachment with server-derived parent fields)", async () => {
    const m = await enrolledMember(w, "civic-comment@example.com", "comment");
    await m.client.createPost(m.t, { body: "root" });

    // The SDK mints the comment's entityId; assert against the ref it returns, not a client-side id.
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

  it("rejects join without a session (401)", async () => {
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/threads/join",
      payload: {
        threadId: randomUUID(), jurisdiction: JURISDICTION,
        personaPubkey: "02".padEnd(66, "a"), signerPubkey: "02".padEnd(66, "b"),
        commitment: "a".repeat(64), devicePubkey: "04".padEnd(130, "c"),
      },
    });
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
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/threads/join", headers: bearer(limited.token),
      payload: {
        threadId: randomUUID(), jurisdiction: JURISDICTION,
        personaPubkey: "02".padEnd(66, "a"), signerPubkey: "02".padEnd(66, "b"),
        commitment: "a".repeat(64), devicePubkey: "04".padEnd(130, "c"),
      },
    });
    expect(res.statusCode).to.equal(403);
  });

  it("rejects join with a civic device the caller does not own (forbidden)", async () => {
    const a = await enrolledMember(w, "civic-owner-a@example.com", "owner-a");
    const b = await fullSessionAccount(w, "civic-owner-b@example.com");
    // B tries to join using A's enrolled device pubkey.
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/threads/join", headers: bearer(b.token),
      payload: {
        threadId: randomUUID(), jurisdiction: JURISDICTION,
        personaPubkey: "02".padEnd(66, "a"), signerPubkey: "02".padEnd(66, "b"),
        commitment: "a".repeat(64), devicePubkey: a.cred.devicePubkey,
      },
    });
    expect(res.statusCode).to.equal(403);
  });

  it("rejects a submission whose thread signer belongs to another account (forbidden)", async () => {
    const a = await enrolledMember(w, "civic-sign-a@example.com", "sign-a");
    const b = await enrolledMember(w, "civic-sign-b@example.com", "sign-b");
    const intent: Intent = { op: "create", type: "post", entityId: a.threadId, content: { body: "a's post" } };

    // A prepares + signs with A's session, but B submits it under B's token.
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(a.token),
      payload: { author: a.sess.personaPubkey(a.t), intent },
    });
    expect(prep.statusCode).to.equal(200);
    const signed = a.sess.buildSigned(a.t, prep.json() as never, intent);
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/submit", headers: bearer(b.token),
      payload: { envelope: signed.envelope, salt: signed.salt, content: signed.content },
    });
    expect(res.statusCode).to.equal(403);
  });

  it("rejects a persona-only envelope (no device signer) on the verified path", async () => {
    const m = await enrolledMember(w, "civic-persona@example.com", "persona");
    const intent: Intent = { op: "create", type: "post", entityId: m.threadId, content: { body: "v1" } };
    const prep = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/prepare", headers: bearer(m.token),
      payload: { author: m.sess.personaPubkey(m.t), intent },
    });
    const signed = m.sess.buildSigned(m.t, prep.json() as never, intent);
    // Strip the device signer → the verified path must reject (requireDeviceSigner).
    const envelope = { ...signed.envelope } as Record<string, unknown>;
    delete envelope.signerPubkey;
    const res = await w.app.inject({
      method: "POST", url: "/v1/civic/appends/submit", headers: bearer(m.token),
      payload: { envelope, salt: signed.salt, content: signed.content },
    });
    expect(res.statusCode).to.be.oneOf([400, 403]);
  });
});
