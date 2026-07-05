// Per-jurisdiction ACT-GATE + SIGN-FLOOR enforcement on the civic write path ([align-w3-gates-schema];
// WEB-APP-GAPS Part 3 + Part 6). This is the acceptance bar the read-model specs (15–18) defer to via
// the openGates fixture seam. Table stakes, per the locked gate matrix:
//   ab-ca-gov    — petition.act = residency tier; poll/result.act = official ROLE; vote.act =
//                  jurisdiction residency with officials DENIED (act-blocked); petition_signature.act =
//                  anyone (sign-now-verify-later — a denied official's signature is ACCEPTED on the
//                  record and excluded from official counts at READ time, never write-blocked);
//                  statements/petitions/polls/votes/signatures carry a PASSKEY sign floor.
//   oursay-global— everything open to anyone at the QUICK floor: a software p256 envelope (signed by a
//                  civic credential enrolled at join) settles end-to-end with sign_tier 0.
// Every 403 must carry machine-readable `details.reason` (tier | residency | role | official_role |
// passkey_required) — that string is the UI lock-state contract, so it is asserted verbatim.

import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1"; // dev passkey custody is env-guarded; set before first construct.

import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { Intent, ThreadRef } from "@oursay/identity";
import { ingestBoundaries, paths, ShapefileSource } from "@oursay/geo";
import { jurisdictions } from "@oursay/jurisdiction-data";
import {
  contentCommitment,
  deriveDeviceThreadSigner,
  deriveNullifierSecret,
  newSalt,
  registerJurisdiction,
  sha256Hex,
  signEnvelopeWithDevice,
  threadNullifier,
} from "@oursay/public-record";
import type { TxEnvelope } from "@oursay/public-record";
import type { KycTier } from "../src/types/kyc.js";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";
import { fullSessionAccount } from "./helpers/account.js";

const AB = "ab-ca-gov";
const GLOBAL = "oursay-global";
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// A known Edmonton point inside the 2019 boundaries (same pin spec 15 uses) — makes a user a resident.
const ALBERTA_2019_SHP = join(
  paths.repoRoot,
  "jurisdiction-data",
  "ab-ca-gov",
  "districts",
  "ElectionsAlberta",
  "2019",
  "EDS_ENACTED_BILL33_15DEC2017.shp",
);
const EDMONTON_LEGISLATURE = { lon: -113.5065, lat: 53.5333 };

function alberta2019Source(): ShapefileSource {
  return new ShapefileSource({
    sourceId: "test/ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
    jurisdictionId: AB,
    effectiveDate: "2019-04-16",
    drawnDate: "2017-12-15",
    boundaryYear: 2019,
    srid: 3401, // NAD83 / Alberta 10-TM (Resource), FE=0
    shpPath: ALBERTA_2019_SHP,
    fieldMap: { name: "EDName2017", ref: "EDNumber20" },
  });
}

interface Member {
  userId: string;
  token: string;
  sess: IdentitySession;
  client: CivicHttpClient;
}

/** Enroll a device + join the GIVEN thread through the SDK (mirrors 12/18's member helpers). */
async function joinMember(w: World, email: string, seed: string, t: ThreadRef): Promise<Member> {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-gates-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t);
  return { userId, token, sess, client };
}

const attest = (w: World, m: Member, tier: KycTier) => w.services.kycService.attest(m.userId, tier);

/** Pin the user's CURRENT private point (the stub geocoder can't target a riding). */
async function seedPoint(w: World, userId: string, point: { lon: number; lat: number }): Promise<void> {
  await w.services.repos.geocode.upsertCurrent({
    userId,
    addressHash: `seed:${userId}`,
    lon: point.lon,
    lat: point.lat,
    provider: "stub",
    confidence: 0.5,
  });
}

/** Make a member a resident of Edmonton (residency tier + a point inside the 2019 boundaries). */
async function makeResident(w: World, m: Member): Promise<void> {
  await attest(w, m, "residency_verified");
  await seedPoint(w, m.userId, EDMONTON_LEGISLATURE);
}

function threadIn(jurisdiction: string): ThreadRef {
  return { threadId: randomUUID(), jurisdiction };
}

/** Raw prepare (the act gate fires here, before parent/content validation touches the intent). */
async function prepare(w: World, m: Member, t: ThreadRef, intent: Intent) {
  return w.app.inject({
    method: "POST",
    url: "/v1/civic/appends/prepare",
    headers: bearer(m.token),
    payload: { author: m.sess.personaPubkey(t), intent },
  });
}

/** Assert a gate rejection: 403 + the machine-readable lock-state contract on details. */
function expectGate403(res: { statusCode: number; payload: string; json(): any }, reason: string, extra: Record<string, unknown> = {}) {
  expect(res.statusCode, res.payload).to.equal(403);
  const details = res.json().error.details as Record<string, unknown>;
  expect(details.reason, res.payload).to.equal(reason);
  for (const [k, v] of Object.entries(extra)) expect(details[k], `details.${k}`).to.deep.equal(v);
}

describe("20 gates: per-jurisdiction act gates + sign floors on the civic write path", () => {
  let w: World;

  // Ingest the real 2019 Alberta boundaries ONCE (Db.reset() truncates geo.districts); each test
  // uses fresh users/threads, so the world is NOT reset per test. Re-register the packaged
  // jurisdictions for order-independence (other suites strip-and-restore gates around themselves).
  before(async function () {
    this.timeout(120000);
    w = await resetWorld();
    for (const j of jurisdictions) registerJurisdiction(j);
    await ingestBoundaries(w.services.geoStore, alberta2019Source());
  });

  it("AB: unverified petition create is act-blocked at prepare (reason tier + requiredTiers)", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "g20-tier@example.com", "g20-tier", t);
    const res = await prepare(w, m, t, { op: "create", type: "petition", entityId: t.threadId, content: { title: "Fix it", text: "please" } });
    expectGate403(res, "tier", { action: "petition", jurisdictionId: AB, requiredTiers: ["residency_verified"] });
  });

  it("AB: an identity-verified non-resident vote is act-blocked (reason residency — tier alone is not residency)", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "g20-res@example.com", "g20-res", t);
    await attest(w, m, "identity_verified");
    // The gate fires before parent validation, so the poll doesn't need to exist to probe it.
    const res = await prepare(w, m, t, { op: "create", type: "vote", entityId: randomUUID(), parent: { type: "poll", id: t.threadId }, content: { option: "yes" } });
    expectGate403(res, "residency", { action: "vote", jurisdictionId: AB });
  });

  it("AB: residency tier WITHOUT a point inside the jurisdiction still fails the vote gate (reason residency)", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "g20-nopoint@example.com", "g20-nopoint", t);
    await attest(w, m, "residency_verified"); // tier yes, but no current point ⇒ no viewer district
    const res = await prepare(w, m, t, { op: "create", type: "vote", entityId: randomUUID(), parent: { type: "poll", id: t.threadId }, content: { option: "yes" } });
    expectGate403(res, "residency", { action: "vote", jurisdictionId: AB });
  });

  it("AB: poll and result creation are official-role-only (reason role)", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "g20-role@example.com", "g20-role", t);
    await makeResident(w, m); // even a full resident is not an official
    const poll = await prepare(w, m, t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Q?", options: ["yes", "no"] } });
    expectGate403(poll, "role", { action: "poll", jurisdictionId: AB });
    const result = await prepare(w, m, t, { op: "create", type: "result", entityId: t.threadId, content: { summary: "..." } });
    expectGate403(result, "role", { action: "result", jurisdictionId: AB });
  });

  it("AB: an official is DENIED on vote (reason official_role) even as a verified resident", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "g20-offvote@example.com", "g20-offvote", t);
    await makeResident(w, m); // would pass the residencyIn act — deny must win over it
    await w.services.repos.membership.setRole(m.userId, AB, "official", "edmonton-city-centre");
    const res = await prepare(w, m, t, { op: "create", type: "vote", entityId: randomUUID(), parent: { type: "poll", id: t.threadId }, content: { option: "yes" } });
    expectGate403(res, "official_role", { action: "vote", jurisdictionId: AB });
  });

  it("AB: a quick-shaped (p256) statement submit is floor-blocked (reason passkey_required)", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const m = await joinMember(w, "g20-floor@example.com", "g20-floor", t);
    // The act gate admits anyone on post — prepare succeeds…
    const intent: Intent = { op: "create", type: "post", entityId: t.threadId, content: { title: "Test post", body: "quick?" } };
    const prep = await prepare(w, m, t, intent);
    expect(prep.statusCode, prep.payload).to.equal(200);
    // …but AB's signMin for post is passkey, so a p256 envelope is rejected at the floor check
    // (before signature verification — the floor is policy, not crypto).
    const envelope = {
      v: 1,
      txId: randomUUID(),
      type: "post",
      entityId: t.threadId,
      op: "create",
      authorPubkey: m.sess.personaPubkey(t),
      signerPubkey: "02".padEnd(66, "b"),
      signature: "00".repeat(64),
      signScheme: "p256",
      createdAt: new Date().toISOString(),
      prevHash: null,
      contentHash: "00".repeat(32),
    };
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/civic/appends/submit",
      headers: bearer(m.token),
      payload: { envelope, salt: newSalt(), content: intent.content },
    });
    expectGate403(res, "passkey_required", { action: "post", jurisdictionId: AB });
  });

  it("AB golden path: official creates the poll, a verified resident's passkey vote lands", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const official = await joinMember(w, "g20-ab-official@example.com", "g20-ab-off", t);
    await w.services.repos.membership.setRole(official.userId, AB, "official", "edmonton-city-centre");
    await official.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Build the LRT?", options: ["yes", "no"] } });

    const resident = await joinMember(w, "g20-ab-resident@example.com", "g20-ab-res", t);
    await makeResident(w, resident);
    const ref = await resident.client.castVote(t, { type: "poll", id: t.threadId }, { option: "yes" });

    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.type).to.equal("vote");
    expect(head!.content).to.deep.equal({ option: "yes" });
    // The C6 relationship snapshot recorded the resident as in-jurisdiction at the verified tier.
    const snap = await w.services.recordStore.getRecordActionGeo(ref.txId);
    expect(snap, "record_action_geo snapshot").to.not.equal(null);
    expect(snap!.inJurisdiction).to.equal(true);
    expect(snap!.tierAtAction).to.equal("residency_verified");
  });

  it("AB: petition signatures are write-through — a denied official's AND an unverified member's both land", async function () {
    this.timeout(60000);
    const t = threadIn(AB);
    const resident = await joinMember(w, "g20-ab-pet-author@example.com", "g20-ab-pa", t);
    await makeResident(w, resident);
    await resident.client.append(t, { op: "create", type: "petition", entityId: t.threadId, content: { title: "Fix the road", text: "please" } });

    // deny [{role:official}] on petition_signature is a READ-time count-exclusion rule (Part 6 #3):
    // the official's signature must be ACCEPTED on the record, never act-blocked.
    const official = await joinMember(w, "g20-ab-pet-off@example.com", "g20-ab-po", t);
    await w.services.repos.membership.setRole(official.userId, AB, "official", "calgary-buffalo");
    const offSig = await official.client.append(t, { op: "create", type: "petition_signature", entityId: randomUUID(), parent: { type: "petition", id: t.threadId }, content: {} });
    expect((await w.services.recordStore.getHeadTx(offSig.entityId))!.type).to.equal("petition_signature");

    // officialCount {residencyIn} is a COUNTING floor, never a participation barrier (Part 6 #2):
    // an unverified member's signature is also accepted (sign-now-verify-later).
    const unverified = await joinMember(w, "g20-ab-pet-unv@example.com", "g20-ab-pu", t);
    const unvSig = await unverified.client.append(t, { op: "create", type: "petition_signature", entityId: randomUUID(), parent: { type: "petition", id: t.threadId }, content: {} });
    expect((await w.services.recordStore.getHeadTx(unvSig.entityId))!.type).to.equal("petition_signature");
  });

  it("global: everything is open to anyone — an unverified member creates a poll and votes on it", async function () {
    this.timeout(60000);
    const t = threadIn(GLOBAL);
    const m = await joinMember(w, "g20-glob-open@example.com", "g20-glob", t);
    await m.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Open?", options: ["yes", "no"] } });
    const ref = await m.client.castVote(t, { type: "poll", id: t.threadId }, { option: "yes" });
    expect((await w.services.recordStore.getHeadTx(ref.entityId))!.type).to.equal("vote");
  });

  it("global: a software p256 QUICK vote settles end-to-end (join → prepare → sign → submit, sign_tier 0)", async function () {
    this.timeout(60000);
    // An SDK member roots the poll; the voter then acts with a SOFT P-256 key only — the exact
    // envelope a Phase-1c quick-signing client will produce (no WebAuthn ceremony anywhere).
    const t = threadIn(GLOBAL);
    const author = await joinMember(w, "g20-quick-author@example.com", "g20-qa", t);
    await author.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Quick?", options: ["yes", "no"] } });

    const { token } = await fullSessionAccount(w, "g20-quick-voter@example.com");
    const signer = deriveDeviceThreadSigner({ deviceRoot: randomBytes(32), threadId: t.threadId, jurisdiction: GLOBAL });

    // Join with the soft key as signerPubkey: first device wins ⇒ it becomes Pₜ AND is enrolled as
    // this device's civic credential (the p256 verify path authorizes against that credential).
    const joinRes = await w.app.inject({
      method: "POST",
      url: "/v1/civic/threads/join",
      headers: bearer(token),
      payload: { threadId: t.threadId, jurisdiction: GLOBAL, signerPubkey: signer.signerPubkey, commitment: sha256Hex(signer.signerPubkey) },
    });
    expect(joinRes.statusCode, joinRes.payload).to.equal(200);
    expect(joinRes.json().personaPubkey).to.equal(signer.signerPubkey);

    const voteId = randomUUID();
    const intent: Intent = { op: "create", type: "vote", entityId: voteId, parent: { type: "poll", id: t.threadId }, content: { option: "yes" } };
    const prepRes = await w.app.inject({
      method: "POST",
      url: "/v1/civic/appends/prepare",
      headers: bearer(token),
      payload: { author: signer.signerPubkey, intent },
    });
    expect(prepRes.statusCode, prepRes.payload).to.equal(200);
    const prep = prepRes.json() as { prevHash: string | null; parentRevisionHash?: string; parentRevisionTxId?: string; nullifierParentId?: string };
    expect(prep.nullifierParentId).to.equal(t.threadId);

    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: "vote", entityId: voteId, op: "create",
      parentType: "poll", parentId: t.threadId,
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content: intent.content }),
      nullifier: threadNullifier(deriveNullifierSecret(randomBytes(32), GLOBAL), prep.nullifierParentId!),
    };
    const { envelope } = signEnvelopeWithDevice(base, signer.privKey, signer.signerPubkey);

    const res = await w.app.inject({
      method: "POST",
      url: "/v1/civic/appends/submit",
      headers: bearer(token),
      payload: { envelope, salt, content: intent.content },
    });
    expect(res.statusCode, res.payload).to.equal(201);
    const ref = res.json() as { txId: string; entityId: string };
    expect(ref.entityId).to.equal(voteId);

    const head = await w.services.recordStore.getHeadTx(voteId);
    expect(head!.type).to.equal("vote");
    expect(head!.authorPubkey).to.equal(signer.signerPubkey);
    // sign_tier derives from the stored envelope's signScheme: anything but webauthn-es256 ⇒ 0 (quick).
    const stored = JSON.parse(head!.envelope) as TxEnvelope;
    expect(stored.signScheme ?? "p256").to.equal("p256");
    // The C6 snapshot landed for the quick path too: unverified tier, geographyless jurisdiction.
    const snap = await w.services.recordStore.getRecordActionGeo(ref.txId);
    expect(snap, "record_action_geo snapshot").to.not.equal(null);
    expect(snap!.tierAtAction).to.equal("unverified");
    expect(snap!.inJurisdiction).to.equal(false);
  });
});
