// Phase 6 e2e smoke — the full civic journey the web-app drives, end to end over the real HTTP surface
// (register → verify → subscribe → post → comment → vote-blocked → residency → vote → persona → profile
// privacy → feed). One ordered journey sharing state across `it`s, exercising the same routes + signed
// write path a browser hits through the Next proxy (via injectFetch + the @oursay/identity SDK — no
// mocks). Account auth ceremony (OTP + passkey login) is covered by specs 01–10; here we register for
// real, then mint a full session so the smoke stays focused on the civic surface. Alberta's real 2019
// boundaries are ingested once so the residency gate transition is genuine.

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1"; // dev passkey custody is env-guarded; set before first construct.

import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { Intent, ThreadRef } from "@oursay/identity";
import { ingestBoundaries, paths, ShapefileSource } from "@oursay/geo";
import { jurisdictions } from "@oursay/jurisdiction-data";
import { registerJurisdiction } from "@oursay/public-record";
import { injectFetch } from "./helpers/inject-fetch.js";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";
import { fullSessionAccount } from "./helpers/account.js";

const AB = "ab-ca-gov";
const GLOBAL = "oursay-global";
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
// A point inside Edmonton's 2019 riding boundaries — the same pin specs 15/20 use to make a resident.
const EDMONTON_LEGISLATURE = { lon: -113.5065, lat: 53.5333 };
const ALBERTA_2019_SHP = join(
  paths.repoRoot,
  "jurisdiction-data",
  "ab-ca-gov",
  "districts",
  "ElectionsAlberta",
  "2019",
  "EDS_ENACTED_BILL33_15DEC2017.shp",
);

function alberta2019Source(): ShapefileSource {
  return new ShapefileSource({
    sourceId: "smoke/ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
    jurisdictionId: AB,
    effectiveDate: "2019-04-16",
    drawnDate: "2017-12-15",
    boundaryYear: 2019,
    srid: 3401,
    shpPath: ALBERTA_2019_SHP,
    fieldMap: { name: "EDName2017", ref: "EDNumber20" },
  });
}

interface CivicMember {
  passkey: DevPasskeyConnector;
  sess: IdentitySession;
  client: CivicHttpClient;
}

/** Enroll this account's civic signing device and wire an SDK client over the inject-backed fetch. */
async function civicMember(w: World, userId: string, token: string, seed: string): Promise<CivicMember> {
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-smoke-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "smoke device" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  return { passkey, sess, client };
}

describe("35 e2e smoke: the full civic journey over the live HTTP surface", function () {
  this.timeout(120_000);

  let w: World;
  let userId: string;
  let token: string;
  let me: CivicMember;
  const handle = "@smokewalker";
  const statement: ThreadRef = { threadId: randomUUID(), jurisdiction: AB };
  const pollThread: ThreadRef = { threadId: randomUUID(), jurisdiction: AB };
  let personaName: string;

  before(async function () {
    w = await resetWorld();
    // Other suites strip-and-restore gates around themselves — re-register for order independence.
    for (const j of jurisdictions) registerJurisdiction(j);
    // Real boundaries so the residency gate transition (vote-blocked → resident → vote) is genuine.
    await ingestBoundaries(w.services.geoStore, alberta2019Source());
  });

  it("registers a slim account via email OTP (handle + over-18 ⇒ 201)", async () => {
    const email = "smoke-walker@example.com";
    const req = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { email, purpose: "registration" },
    });
    expect(req.statusCode).to.equal(202);
    const code = codeFromLastMail(w.mail, email);

    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { handle, over18: true } },
    });
    expect(res.statusCode, res.body).to.equal(201);
    userId = res.json().userId as string;
    expect(res.json().session.scope).to.equal("registration");

    // Full scope is granted by passkey login in the UI (specs 03/10); mint it here so the smoke can
    // drive the full-scope civic + /v1/me surface without re-deriving the WebAuthn login ceremony.
    token = (await w.services.authService.issue(userId, "full", "smoke")).token;
    me = await civicMember(w, userId, token, "smoke-me");
  });

  it("dev-attests identity_verified (the dev Get-Verified path)", async () => {
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/dev/kyc/attest",
      headers: bearer(token),
      payload: { tier: "identity_verified" },
    });
    expect(res.statusCode, res.body).to.equal(200);
    expect(res.json().tier).to.equal("identity_verified");
  });

  it("subscribes to Alberta (oursay-global is always retained)", async () => {
    const res = await w.app.inject({
      method: "PUT",
      url: "/v1/me/jurisdictions",
      headers: bearer(token),
      payload: { jurisdictionIds: [AB] },
    });
    expect(res.statusCode, res.body).to.equal(200);
    expect(res.json().jurisdictionIds).to.include.members([AB, GLOBAL]);
  });

  it("posts a statement in Alberta with a passkey signature", async () => {
    await me.client.ensureJoined(statement);
    const ref = await me.client.createPost(statement, { title: "Twin the highway", body: "QE2 needs it" }, { sign: "passkey" });
    expect(ref.entityId).to.equal(statement.threadId);
    const head = await w.services.recordStore.getHeadTx(statement.threadId);
    expect(head!.type).to.equal("post");
    expect(head!.authorPubkey).to.equal(me.sess.personaPubkey(statement));
    personaName = (await w.services.recordStore.getPersonaName(me.sess.personaPubkey(statement)))!;
    expect(personaName).to.be.a("string");
  });

  it("quick-signs a comment on the statement", async () => {
    const ref = await me.client.createComment(statement, { type: "post", id: statement.threadId }, { body: "Agreed — the merges are dangerous" }, { sign: "quick" });
    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.type).to.equal("comment");
    expect(head!.content).to.deep.equal({ body: "Agreed — the merges are dangerous" });
  });

  it("an Alberta official opens a poll (role-gated authorship)", async () => {
    const official = await fullSessionAccount(w, "smoke-official@example.com", { handle: "@smokemla" });
    await w.services.repos.membership.setRole(official.userId, AB, "official", "edmonton-city-centre");
    const off = await civicMember(w, official.userId, official.token, "smoke-official");
    await off.client.ensureJoined(pollThread);
    await off.client.append(
      pollThread,
      { op: "create", type: "poll", entityId: pollThread.threadId, content: { question: "Build the LRT extension?", options: ["yes", "no"] } },
      { sign: "passkey" },
    );
    const head = await w.services.recordStore.getHeadTx(pollThread.threadId);
    expect(head!.type).to.equal("poll");
  });

  it("the member's vote is act-blocked before residency (403, reason residency)", async () => {
    await me.client.ensureJoined(pollThread);
    const intent: Intent = { op: "create", type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollThread.threadId }, content: { option: "yes" } };
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/civic/appends/prepare",
      headers: bearer(token),
      payload: { author: me.sess.personaPubkey(pollThread), intent },
    });
    expect(res.statusCode, res.payload).to.equal(403);
    const details = res.json().error.details as { reason: string; action: string };
    expect(details.reason).to.equal("residency");
    expect(details.action).to.equal("vote");
  });

  it("sets an address and platform-attests residency for Alberta", async () => {
    // The address write is the real UI path (PATCH /v1/profile → best-effort geocode)…
    const patch = await w.app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: bearer(token),
      payload: { province: "AB", postalCode: "T5K 2B6", country: "CA" },
    });
    expect(patch.statusCode, patch.body).to.equal(200);
    // …but the stub geocoder can't resolve a postal code to a specific riding, so pin the known
    // interior point directly (the seed script does the same) before the residency gate reads it.
    await w.services.repos.geocode.upsertCurrent({
      userId,
      addressHash: `smoke:${userId}`,
      lon: EDMONTON_LEGISLATURE.lon,
      lat: EDMONTON_LEGISLATURE.lat,
      provider: "seed",
      confidence: 0.9,
    });
    const attest = await w.app.inject({
      method: "POST",
      url: "/v1/kyc/residency/attest",
      headers: bearer(token),
      payload: { consent: true, jurisdictionId: AB },
    });
    expect(attest.statusCode, attest.body).to.equal(200);
    expect(attest.json().tier).to.equal("residency_verified");
  });

  it("now the member's passkey vote lands, with an in-jurisdiction geo snapshot", async () => {
    const ref = await me.client.castVote(pollThread, { type: "poll", id: pollThread.threadId }, { option: "yes" }, { sign: "passkey" });
    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.type).to.equal("vote");
    expect(head!.content).to.deep.equal({ option: "yes" });
    const snap = await w.services.recordStore.getRecordActionGeo(ref.txId);
    expect(snap!.inJurisdiction).to.equal(true);
    expect(snap!.tierAtAction).to.equal("residency_verified");
  });

  it("the member's Alberta persona resolves on the public persona page", async () => {
    const res = await w.app.inject({ method: "GET", url: `/v1/public/personas/${encodeURIComponent(personaName)}` });
    expect(res.statusCode, res.body).to.equal(200);
    expect(res.json().name).to.equal(personaName);
    expect(res.json().threadId).to.equal(statement.threadId);
    expect(res.json().isRootAuthor).to.equal(true);
  });

  it("the member's account profile is private to strangers (404) but visible to self", async () => {
    // Registration defaults visibility to anonymous — a stranger gets 404 (not 403), same shape as
    // an unknown handle, so the account's existence isn't leaked.
    const stranger = await w.app.inject({ method: "GET", url: `/v1/public/profiles/${encodeURIComponent(handle.slice(1))}` });
    expect(stranger.statusCode).to.equal(404);
    const own = await w.app.inject({
      method: "GET",
      url: `/v1/public/profiles/${encodeURIComponent(handle.slice(1))}`,
      headers: bearer(token),
    });
    expect(own.statusCode, own.body).to.equal(200);
    expect(own.json().handle).to.equal(handle.slice(1));
  });

  it("the public feed renders the journey's seeded roots", async () => {
    const res = await w.app.inject({ method: "GET", url: "/v1/public/feed?limit=50" });
    expect(res.statusCode, res.body).to.equal(200);
    const ids = (res.json().items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).to.include.members([statement.threadId, pollThread.threadId]);
  });
});
