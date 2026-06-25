// Geo filter resolution on the public READ count surface (mvp-c7-filter-resolution). The count
// endpoints (/v1/public/{posts,petitions,polls}/:id/counts) now resolve the coarse `scope` into a
// Region (RegionResolver.compileScope) and tally only DISTINCT participants whose private current
// point falls inside it (ParticipantGeoService.participantInRegion → region.contains), with a
// k-anonymity floor. Tier/date stay stubbed.
//
// We drive REAL signed civic writes (multiple enrolled members on ONE shared thread react / vote /
// sign on a single root), then SEED each member's private point to a known riding (the stub geocoder
// can't target one — see 15-participant-geo). Counts then change by scope. k-anon is toggled via the
// live-read env vars PUBLIC_COUNTS_K_ANONYMITY_MIN/_DEFAULT (the shared World is built once, so the
// floor MUST be request-time; that is what makes this togglable).

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1"; // dev passkey custody is env-guarded; set before first construct.

import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { ThreadRef } from "@oursay/identity";
import { ingestBoundaries, paths, ShapefileSource } from "@oursay/geo";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";
const JURISDICTION = "ab-ca-gov";

// Known lon/lat points and the 2019 riding revisions that contain them (verified by @oursay/geo).
const EDMONTON_LEGISLATURE = { lon: -113.5065, lat: 53.5333 }; // edmonton-city-centre-2019
const CALGARY_CITY_HALL = { lon: -114.056, lat: 51.0451 }; //     calgary-buffalo-2019 (in AB, not Edmonton)
const TORONTO = { lon: -79.3832, lat: 43.6532 }; //              outside Alberta entirely
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
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-cg-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t);
  return { userId, sess, client };
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

describe("16 public-record counts: geo scope resolution + k-anonymity", () => {
  let w: World;

  before(async function () {
    this.timeout(60000);
    w = await resetWorld();
    await ingestBoundaries(w.services.geoStore, alberta2019Source());
  });

  // Default (env unset) ⇒ k-anon floor 5/5. Tests that assert raw divergence disable it; restore after.
  afterEach(() => {
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN;
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT;
  });

  function disableKAnon() {
    process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN = "0";
    process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT = "0";
  }

  it("poll votes: counts change by scope; jurisdiction ⊇ impacted-region; no-point excluded from scoped", async function () {
    this.timeout(60000);
    disableKAnon(); // assert raw divergence, not suppression
    const t = freshThread();
    const author = await joinMember(w, "cg-poll-author@example.com", "poll-author", t);
    await author.client.append(t, {
      op: "create", type: "poll", entityId: t.threadId,
      content: { question: "Build it?", options: ["yes", "no"], rules: { appliesToDistrictIds: [EDMONTON_CITY_CENTRE_2019] } },
    });
    const parent = { type: "poll" as const, id: t.threadId };

    const edm1 = await joinMember(w, "cg-poll-edm1@example.com", "poll-edm1", t);
    const edm2 = await joinMember(w, "cg-poll-edm2@example.com", "poll-edm2", t);
    const cal1 = await joinMember(w, "cg-poll-cal1@example.com", "poll-cal1", t);
    const nopt = await joinMember(w, "cg-poll-nopt@example.com", "poll-nopt", t);
    await edm1.client.castVote(t, parent, { option: "yes" });
    await edm2.client.castVote(t, parent, { option: "yes" });
    await cal1.client.castVote(t, parent, { option: "no" });
    await nopt.client.castVote(t, parent, { option: "yes" }); // verified vote, but no seeded point
    await seedPoint(w, edm1.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, edm2.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, cal1.userId, CALGARY_CITY_HALL);
    // nopt deliberately left without a geocode row.

    // all-public: everyone counts (no geo filter), including the no-point voter.
    const pub = await counts(w, "polls", t.threadId, "?scope=all-public");
    expect(optionCount(pub.results, "yes")!.count).to.equal(3);
    expect(optionCount(pub.results, "no")!.count).to.equal(1);
    expect(pub.filters.applied).to.deep.equal({ geo: false, tier: false, date: false });
    expect(pub.filters.kAnonymityFloor).to.equal(null);

    // impacted-region (Edmonton riding only): the 2 Edmonton voters; Calgary + no-point excluded.
    const imp = await counts(w, "polls", t.threadId, "?scope=impacted-region");
    expect(optionCount(imp.results, "yes")!.count).to.equal(2);
    expect(optionCount(imp.results, "no")!.count).to.equal(0); // genuine 0, not suppressed
    expect(optionCount(imp.results, "no")!.suppressed).to.equal(undefined);
    expect(imp.filters.applied.geo).to.equal(true);

    // jurisdiction (whole Alberta extent): Edmonton + Calgary count (both in AB); no-point excluded.
    // Differs from impacted-region on "no" (1 vs 0) — locks compileScope's forJurisdiction branch.
    const jur = await counts(w, "polls", t.threadId, "?scope=jurisdiction");
    expect(optionCount(jur.results, "yes")!.count).to.equal(2);
    expect(optionCount(jur.results, "no")!.count).to.equal(1);
    expect(jur.filters.applied.geo).to.equal(true);
  });

  it("poll votes: k-anonymity suppresses a small in-region bucket; all-public stays unmasked", async function () {
    this.timeout(60000);
    // env unset ⇒ floor 5/5.
    const t = freshThread();
    const author = await joinMember(w, "cg-k-author@example.com", "k-author", t);
    await author.client.append(t, {
      op: "create", type: "poll", entityId: t.threadId,
      content: { question: "Now?", options: ["yes", "no"], rules: { appliesToDistrictIds: [EDMONTON_CITY_CENTRE_2019] } },
    });
    const parent = { type: "poll" as const, id: t.threadId };

    const edm1 = await joinMember(w, "cg-k-edm1@example.com", "k-edm1", t);
    const edm2 = await joinMember(w, "cg-k-edm2@example.com", "k-edm2", t);
    const cal1 = await joinMember(w, "cg-k-cal1@example.com", "k-cal1", t);
    const cal2 = await joinMember(w, "cg-k-cal2@example.com", "k-cal2", t);
    await edm1.client.castVote(t, parent, { option: "yes" });
    await edm2.client.castVote(t, parent, { option: "yes" });
    await cal1.client.castVote(t, parent, { option: "no" });
    await cal2.client.castVote(t, parent, { option: "no" });
    await seedPoint(w, edm1.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, edm2.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, cal1.userId, CALGARY_CITY_HALL);
    await seedPoint(w, cal2.userId, CALGARY_CITY_HALL);

    // all-public: raw, never masked (k-anon applies only to a narrowing filter).
    const pub = await counts(w, "polls", t.threadId, "?scope=all-public");
    expect(optionCount(pub.results, "yes")!.count).to.equal(2);
    expect(optionCount(pub.results, "no")!.count).to.equal(2);

    // impacted-region: "yes" has 2 in-region (0 < 2 < 5) ⇒ suppressed; "no" has 0 in-region ⇒ stays 0.
    const imp = await counts(w, "polls", t.threadId, "?scope=impacted-region");
    expect(imp.filters.kAnonymityFloor).to.equal(5);
    const yes = optionCount(imp.results, "yes")!;
    expect(yes.count).to.equal(null);
    expect(yes.suppressed).to.equal(true);
    const no = optionCount(imp.results, "no")!;
    expect(no.count).to.equal(0);
    expect(no.suppressed).to.equal(undefined);
  });

  it("petition signatures: scoped scalar is suppressed below the floor; all-public is the raw count", async function () {
    this.timeout(60000);
    // env unset ⇒ floor 5/5.
    const t = freshThread();
    const author = await joinMember(w, "cg-pet-author@example.com", "pet-author", t);
    await author.client.append(t, {
      op: "create", type: "petition", entityId: t.threadId,
      content: { title: "Fix the road", text: "please", rules: { appliesToDistrictIds: [EDMONTON_CITY_CENTRE_2019] } },
    });
    const sign = async (m: Member) =>
      m.client.append(t, { op: "create", type: "petition_signature", entityId: randomUUID(), parent: { type: "petition", id: t.threadId }, content: {} });

    const edm1 = await joinMember(w, "cg-pet-edm1@example.com", "pet-edm1", t);
    const edm2 = await joinMember(w, "cg-pet-edm2@example.com", "pet-edm2", t);
    const cal1 = await joinMember(w, "cg-pet-cal1@example.com", "pet-cal1", t);
    await sign(edm1);
    await sign(edm2);
    await sign(cal1);
    await seedPoint(w, edm1.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, edm2.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, cal1.userId, CALGARY_CITY_HALL);

    const pub = await counts(w, "petitions", t.threadId, "?scope=all-public");
    expect(pub.signatureCount).to.equal(3);
    expect(pub.suppressed).to.equal(false);

    // impacted-region: 2 Edmonton signers (0 < 2 < 5) ⇒ count withheld.
    const imp = await counts(w, "petitions", t.threadId, "?scope=impacted-region");
    expect(imp.signatureCount).to.equal(null);
    expect(imp.suppressed).to.equal(true);
    expect(imp.filters.applied.geo).to.equal(true);
    expect(imp.filters.kAnonymityFloor).to.equal(5);
  });

  it("post reactions: jurisdiction scope excludes out-of-province; tier + my-district stay inert", async function () {
    this.timeout(60000);
    disableKAnon(); // assert raw divergence
    const t = freshThread();
    const author = await joinMember(w, "cg-post-author@example.com", "post-author", t);
    await author.client.createPost(t, { body: "open belief" });
    const parent = { type: "post" as const, id: t.threadId };

    const edm1 = await joinMember(w, "cg-post-edm1@example.com", "post-edm1", t);
    const edm2 = await joinMember(w, "cg-post-edm2@example.com", "post-edm2", t);
    const tor1 = await joinMember(w, "cg-post-tor1@example.com", "post-tor1", t);
    await edm1.client.addReaction(t, parent, { kind: "check" });
    await edm2.client.addReaction(t, parent, { kind: "check" });
    await tor1.client.addReaction(t, parent, { kind: "check" });
    await seedPoint(w, edm1.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, edm2.userId, EDMONTON_LEGISLATURE);
    await seedPoint(w, tor1.userId, TORONTO);

    const checkOf = (body: any) => (body.reactionsByEntity.find((r: any) => r.kind === "check")?.count ?? 0);

    // all-public: all 3 reactions, no geo filter.
    const pub = await counts(w, "posts", t.threadId, "?scope=all-public");
    expect(checkOf(pub)).to.equal(3);
    expect(pub.filters.applied.geo).to.equal(false);

    // jurisdiction: the 2 Alberta reactors; the Toronto reactor is outside every AB riding.
    const jur = await counts(w, "posts", t.threadId, "?scope=jurisdiction");
    expect(checkOf(jur)).to.equal(2);
    expect(jur.filters.applied.geo).to.equal(true);

    // tier is parsed + echoed but does NOT change the count (awaits [mvp-c-kyc-stub]).
    const tier = await counts(w, "posts", t.threadId, "?scope=all-public&tier=identity_verified");
    expect(checkOf(tier)).to.equal(3);
    expect(tier.filters.applied.tier).to.equal(false);
    expect(tier.filters.tier).to.equal("identity_verified");

    // my-district is inert on unauthenticated routes ⇒ no geo filter, raw count.
    const mine = await counts(w, "posts", t.threadId, "?scope=my-district");
    expect(checkOf(mine)).to.equal(3);
    expect(mine.filters.applied.geo).to.equal(false);
  });
});
