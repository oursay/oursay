// KYC tier resolution on the public READ count surface ([mvp-c-kyc-stub], C8). The count endpoints
// (/v1/public/{posts,petitions,polls}/:id/counts) resolve the requested `tier` SET and tally only
// DISTINCT participants whose CURRENT verification tier is IN that set (set membership — NOT at-or-above),
// with a k-anonymity floor. Combined with geo `scope` it is AND (in-region AND in tier set).
//
// We drive REAL signed civic writes (members vote/sign on one shared root), then attest each member to a
// tier via KycService.attest (the dev seam that replaces a raw kyc_attestations INSERT — mirrors spec
// 16's seedPoint). Counts then change by tier. k-anon is toggled via the live-read env vars.

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1"; // dev passkey custody is env-guarded; set before first construct.

import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { ThreadRef } from "@oursay/identity";
import { getJurisdiction, registerJurisdiction } from "@oursay/public-record";
import { ingestBoundaries, paths, ShapefileSource } from "@oursay/geo";
import type { KycTier } from "../src/types/kyc.js";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";
const JURISDICTION = "ab-ca-gov";

// Known lon/lat points and the 2019 riding that contains them (verified by @oursay/geo; see spec 16).
const EDMONTON_LEGISLATURE = { lon: -113.5065, lat: 53.5333 }; // edmonton-city-centre-2019
const CALGARY_CITY_HALL = { lon: -114.056, lat: 51.0451 }; //     calgary-buffalo-2019 (in AB, not Edmonton)
const EDMONTON_CITY_CENTRE_2019 = "edmonton-city-centre-2019";

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
    sourceId: "test/ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
    jurisdictionId: JURISDICTION,
    effectiveDate: "2019-04-16",
    drawnDate: "2017-12-15",
    boundaryYear: 2019,
    srid: 3401,
    shpPath: ALBERTA_2019_SHP,
    fieldMap: { name: "EDName2017", ref: "EDNumber20" },
  });
}

interface Member {
  userId: string;
  sess: IdentitySession;
  client: CivicHttpClient;
}

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

/** Enroll a device + join the GIVEN shared thread `t` (so many members participate on one root). */
async function joinMember(w: World, email: string, seed: string, t: ThreadRef): Promise<Member> {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-ct-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t);
  return { userId, sess, client };
}

/** Award a current tier via the KYC dev seam (provider -> kyc_attestations) — the tier analogue of
 *  spec 16's seedPoint. */
async function attest(w: World, m: Member, tier: KycTier): Promise<void> {
  await w.services.kycService.attest(m.userId, tier);
}

async function seedPoint(w: World, userId: string, point: { lon: number; lat: number }): Promise<void> {
  await w.services.repos.geocode.upsertCurrent({
    userId, addressHash: `seed:${userId}`, lon: point.lon, lat: point.lat, provider: "stub", confidence: 0.5,
  });
}

function freshThread(): ThreadRef {
  return { threadId: randomUUID(), jurisdiction: JURISDICTION };
}

async function counts(w: World, kind: "polls" | "petitions" | "posts", id: string, query = ""): Promise<any> {
  const res = await w.app.inject({ method: "GET", url: `/v1/public/${kind}/${id}/counts${query}` });
  expect(res.statusCode, res.payload).to.equal(200);
  return res.json();
}

function optionCount(results: { option: string; count: number | null; suppressed?: boolean }[], option: string) {
  return results.find((r) => r.option === option);
}

describe("17 public-record counts: KYC tier resolution (set membership) + combined geo+tier", () => {
  let w: World;
  let abCaGovOriginal: ReturnType<typeof getJurisdiction>;

  before(async function () {
    this.timeout(60000);
    w = await resetWorld();
    await ingestBoundaries(w.services.geoStore, alberta2019Source());
    // C9 count-exposure gating is OFF for these TIER-FILTER tests: re-register ab-ca-gov with PERMISSIVE
    // counts so the tier FILTER (which participants count) is isolated from the exposure GATE (whether the
    // scalar is disclosed at all). The real tier-gated exposure policy is exercised in spec 18. Restored
    // in after().
    abCaGovOriginal = getJurisdiction(JURISDICTION);
    registerJurisdiction({ ...abCaGovOriginal, counts: { votes: true, signatures: true } });
  });

  after(() => {
    registerJurisdiction(abCaGovOriginal);
  });

  // Default (env unset) ⇒ k-anon floor 5/5. Tests asserting raw divergence disable it; restore after.
  afterEach(() => {
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN;
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT;
  });

  function disableKAnon() {
    process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN = "0";
    process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT = "0";
  }

  it("poll votes: ?tier= is set membership (not at-or-above); unverified includes the un-attested", async function () {
    this.timeout(60000);
    disableKAnon(); // assert raw divergence, not suppression
    const t = freshThread();
    const author = await joinMember(w, "ct-set-author@example.com", "set-author", t);
    await author.client.append(t, {
      op: "create", type: "poll", entityId: t.threadId,
      content: { question: "Build it?", options: ["yes", "no"] },
    });
    const parent = { type: "poll" as const, id: t.threadId };

    const vId = await joinMember(w, "ct-set-id@example.com", "set-id", t);
    const vRes = await joinMember(w, "ct-set-res@example.com", "set-res", t);
    const vElec = await joinMember(w, "ct-set-elec@example.com", "set-elec", t);
    const vUnv = await joinMember(w, "ct-set-unv@example.com", "set-unv", t);
    for (const m of [vId, vRes, vElec, vUnv]) await m.client.castVote(t, parent, { option: "yes" });
    await attest(w, vId, "identity_verified");
    await attest(w, vRes, "residency_verified");
    await attest(w, vElec, "electoral_validated");
    // vUnv deliberately left without an attestation ⇒ resolves to `unverified`.

    // No tier ⇒ raw: all four voters.
    const all = await counts(w, "polls", t.threadId, "?scope=all-public");
    expect(optionCount(all.results, "yes")!.count).to.equal(4);
    expect(all.filters.applied).to.deep.equal({ geo: false, tier: false, date: false });
    expect(all.filters.kAnonymityFloor).to.equal(null);

    // ?tier=identity_verified ⇒ ONLY the identity-verified voter — NOT residency/electoral (set
    // membership, not cumulative). This is the key non-ladder assertion.
    const id = await counts(w, "polls", t.threadId, "?tier=identity_verified");
    expect(optionCount(id.results, "yes")!.count).to.equal(1);
    expect(id.filters.applied.tier).to.equal(true);
    expect(id.filters.applied.geo).to.equal(false);
    expect(id.filters.tier).to.deep.equal(["identity_verified"]);

    // Repeated param ⇒ a SET (OR): identity OR electoral, but NOT residency.
    const idElec = await counts(w, "polls", t.threadId, "?tier=identity_verified&tier=electoral_validated");
    expect(optionCount(idElec.results, "yes")!.count).to.equal(2);
    expect(idElec.filters.tier).to.deep.equal(["identity_verified", "electoral_validated"]);

    // ?tier=unverified ⇒ ONLY the un-attested voter (no row ⇒ unverified).
    const unv = await counts(w, "polls", t.threadId, "?tier=unverified");
    expect(optionCount(unv.results, "yes")!.count).to.equal(1);
    expect(unv.filters.applied.tier).to.equal(true);
  });

  it("poll votes: the full tier set is a no-op (applied.tier false, raw count, no floor)", async function () {
    this.timeout(60000);
    const t = freshThread();
    const author = await joinMember(w, "ct-full-author@example.com", "full-author", t);
    await author.client.append(t, {
      op: "create", type: "poll", entityId: t.threadId,
      content: { question: "All?", options: ["yes", "no"] },
    });
    const parent = { type: "poll" as const, id: t.threadId };

    const a = await joinMember(w, "ct-full-a@example.com", "full-a", t);
    const b = await joinMember(w, "ct-full-b@example.com", "full-b", t);
    await a.client.castVote(t, parent, { option: "yes" });
    await b.client.castVote(t, parent, { option: "yes" });
    await attest(w, a, "identity_verified");
    // b stays unverified.

    // Listing every tier includes `unverified` ⇒ everyone ⇒ a no-op: NOT applied, no k-anon floor
    // (default 5/5 here), raw count passes through (2 ≥ would-be-floor not even consulted).
    const full = await counts(
      w, "polls", t.threadId,
      "?tier=unverified&tier=identity_verified&tier=residency_verified&tier=electoral_validated",
    );
    expect(optionCount(full.results, "yes")!.count).to.equal(2);
    expect(full.filters.applied.tier).to.equal(false);
    expect(full.filters.kAnonymityFloor).to.equal(null);
    // The echo still reports the requested (de-duped) set even though it did not narrow.
    expect(full.filters.tier).to.have.members(["unverified", "identity_verified", "residency_verified", "electoral_validated"]);
  });

  it("poll votes: k-anonymity suppresses a small tier-scoped bucket; all-public stays unmasked", async function () {
    this.timeout(60000);
    // env unset ⇒ floor 5/5.
    const t = freshThread();
    const author = await joinMember(w, "ct-k-author@example.com", "k-author", t);
    await author.client.append(t, {
      op: "create", type: "poll", entityId: t.threadId,
      content: { question: "Now?", options: ["yes", "no"] },
    });
    const parent = { type: "poll" as const, id: t.threadId };

    const a = await joinMember(w, "ct-k-a@example.com", "k-a", t);
    const b = await joinMember(w, "ct-k-b@example.com", "k-b", t);
    await a.client.castVote(t, parent, { option: "yes" });
    await b.client.castVote(t, parent, { option: "yes" });
    await attest(w, a, "identity_verified");
    await attest(w, b, "identity_verified");

    // all-public: raw, never masked (k-anon applies only to a narrowing filter).
    const pub = await counts(w, "polls", t.threadId, "?scope=all-public");
    expect(optionCount(pub.results, "yes")!.count).to.equal(2);

    // tier-only narrowing ⇒ k-anon floor engages (5): the "yes" bucket has 2 (0 < 2 < 5) ⇒ suppressed.
    const id = await counts(w, "polls", t.threadId, "?tier=identity_verified");
    expect(id.filters.applied.tier).to.equal(true);
    expect(id.filters.applied.geo).to.equal(false);
    expect(id.filters.kAnonymityFloor).to.equal(5);
    const yes = optionCount(id.results, "yes")!;
    expect(yes.count).to.equal(null);
    expect(yes.suppressed).to.equal(true);
  });

  it("poll votes: combined geo + tier is AND (in-region AND in the tier set)", async function () {
    this.timeout(60000);
    disableKAnon(); // assert raw divergence
    const t = freshThread();
    const author = await joinMember(w, "ct-and-author@example.com", "and-author", t);
    await author.client.append(t, {
      op: "create", type: "poll", entityId: t.threadId,
      content: { question: "Local?", options: ["yes", "no"], rules: { appliesToDistrictIds: [EDMONTON_CITY_CENTRE_2019] } },
    });
    const parent = { type: "poll" as const, id: t.threadId };

    const edmId = await joinMember(w, "ct-and-edmid@example.com", "and-edmid", t); // in-region + identity
    const edmRes = await joinMember(w, "ct-and-edmres@example.com", "and-edmres", t); // in-region + residency
    const calId = await joinMember(w, "ct-and-calid@example.com", "and-calid", t); // out-of-region + identity
    for (const m of [edmId, edmRes, calId]) await m.client.castVote(t, parent, { option: "yes" });
    await seedPoint(w, edmId.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, edmRes.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, calId.userId, CALGARY_CITY_HALL);
    await attest(w, edmId, "identity_verified");
    await attest(w, edmRes, "residency_verified");
    await attest(w, calId, "identity_verified");

    // impacted-region alone: the two Edmonton voters (Calgary excluded).
    const geo = await counts(w, "polls", t.threadId, "?scope=impacted-region");
    expect(optionCount(geo.results, "yes")!.count).to.equal(2);

    // impacted-region AND identity_verified: in-region (edmId, edmRes) ∩ identity (edmId, calId) = {edmId} ⇒ 1.
    const both = await counts(w, "polls", t.threadId, "?scope=impacted-region&tier=identity_verified");
    expect(optionCount(both.results, "yes")!.count).to.equal(1);
    expect(both.filters.applied.geo).to.equal(true);
    expect(both.filters.applied.tier).to.equal(true);
  });

  it("petition signatures: scalar count is filtered by the tier set", async function () {
    this.timeout(60000);
    disableKAnon();
    const t = freshThread();
    const author = await joinMember(w, "ct-pet-author@example.com", "pet-author", t);
    await author.client.append(t, {
      op: "create", type: "petition", entityId: t.threadId,
      content: { title: "Fix it", text: "please" },
    });
    const sign = async (m: Member) =>
      m.client.append(t, { op: "create", type: "petition_signature", entityId: randomUUID(), parent: { type: "petition", id: t.threadId }, content: {} });

    const sId1 = await joinMember(w, "ct-pet-id1@example.com", "pet-id1", t);
    const sId2 = await joinMember(w, "ct-pet-id2@example.com", "pet-id2", t);
    const sUnv = await joinMember(w, "ct-pet-unv@example.com", "pet-unv", t);
    await sign(sId1);
    await sign(sId2);
    await sign(sUnv);
    await attest(w, sId1, "identity_verified");
    await attest(w, sId2, "identity_verified");
    // sUnv unverified.

    const pub = await counts(w, "petitions", t.threadId, "?scope=all-public");
    expect(pub.signatureCount).to.equal(3);
    expect(pub.suppressed).to.equal(false);

    const id = await counts(w, "petitions", t.threadId, "?tier=identity_verified");
    expect(id.signatureCount).to.equal(2);
    expect(id.suppressed).to.equal(false);
    expect(id.filters.applied.tier).to.equal(true);
    expect(id.filters.tier).to.deep.equal(["identity_verified"]);
  });

  it("post reactions: tier set narrows the by-entity tally", async function () {
    this.timeout(60000);
    disableKAnon();
    const t = freshThread();
    const author = await joinMember(w, "ct-post-author@example.com", "post-author", t);
    await author.client.createPost(t, { title: "Test post", body: "open belief" });
    const parent = { type: "post" as const, id: t.threadId };

    const rId = await joinMember(w, "ct-post-id@example.com", "post-id", t);
    const rRes = await joinMember(w, "ct-post-res@example.com", "post-res", t);
    const rUnv = await joinMember(w, "ct-post-unv@example.com", "post-unv", t);
    for (const m of [rId, rRes, rUnv]) await m.client.addReaction(t, parent, { kind: "check" });
    await attest(w, rId, "identity_verified");
    await attest(w, rRes, "residency_verified");
    // rUnv unverified.

    const checkOf = (body: any) => (body.reactionsByEntity.find((r: any) => r.kind === "check")?.count ?? 0);

    const pub = await counts(w, "posts", t.threadId, "?scope=all-public");
    expect(checkOf(pub)).to.equal(3);

    // ?tier=identity_verified&tier=residency_verified ⇒ the two attested reactors (unverified excluded).
    const some = await counts(w, "posts", t.threadId, "?tier=identity_verified&tier=residency_verified");
    expect(checkOf(some)).to.equal(2);
    expect(some.filters.applied.tier).to.equal(true);
    expect(some.filters.tier).to.deep.equal(["identity_verified", "residency_verified"]);
  });

  it("dev attest route: full session self-attests; 401 without a session; writes the latest tier", async () => {
    const { userId, token } = await fullSessionAccount(w, "ct-dev-attest@example.com");

    // No session ⇒ 401 (guarded like the rest of the authenticated surface).
    const anon = await w.app.inject({ method: "POST", url: "/v1/dev/kyc/attest", payload: { tier: "identity_verified" } });
    expect(anon.statusCode).to.equal(401);

    // Full session ⇒ awards the tier and persists it (same table KycRepo + counts read).
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/dev/kyc/attest",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "identity_verified" },
    });
    expect(res.statusCode, res.payload).to.equal(200);
    expect(res.json().tier).to.equal("identity_verified");
    expect(await w.services.repos.kyc.latestTier(userId)).to.equal("identity_verified");
  });
});
