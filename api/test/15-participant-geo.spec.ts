// ParticipantGeoService: the PRIVATE, service-layer bridge from a civic-record participant to the
// geography inputs C7 filtering needs. We drive a REAL civic write (join → post/vote via the
// @oursay/identity SDK), then resolve the resulting record_tx participant key (authorPubkey=Pₜ, or a
// singleton's nullifier+parentId) back to a userId, its private cached point, and the district
// revision that contains it.
//
// On the geocoder: the dev stub scatters a point deterministically inside an Alberta-ish bbox but
// CANNOT target a specific riding. So for riding-level assertions we SEED a known Alberta point
// directly via GeocodeRepo.upsertCurrent (reusing the coordinates geo's own tests pin to ridings) —
// the participant still comes from a genuine signed civic write; only the point is pinned.

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
const ASOF = new Date("2020-01-01"); // after the 2019-04-16 effective date below.

// Known lon/lat points and the 2019 riding revision ids that contain them (verified by @oursay/geo).
const EDMONTON_LEGISLATURE = { lon: -113.5065, lat: 53.5333 };
const CALGARY_CITY_HALL = { lon: -114.056, lat: 51.0451 };
const EDMONTON_CITY_CENTRE_2019 = "edmonton-city-centre-2019";
const CALGARY_BUFFALO_2019 = "calgary-buffalo-2019";

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
  threadId: string;
  t: ThreadRef;
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

/** Unlock a signing session and join a fresh thread through the SDK (creates the device's thread
 *  passkey + registers its signer under Pₜ). Mirrors api/test/12-civic-record.spec.ts. */
async function enrolledMember(w: World, email: string, seed: string): Promise<Member> {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-pg-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const threadId = randomUUID();
  const t: ThreadRef = { threadId, jurisdiction: JURISDICTION };
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t);
  return { userId, token, sess, client, threadId, t };
}

/** Pin a user's CURRENT private point to a known coordinate (the stub can't target a riding). */
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

describe("15 participant-geo: civic participant → private point → district revision", () => {
  let w: World;

  // Ingest the real 2019 Alberta boundaries ONCE (Db.reset() truncates geo.districts). Tests below use
  // fresh random users/threads and read-only resolution, so they don't reset the world per-test.
  before(async function () {
    this.timeout(60000);
    w = await resetWorld();
    await ingestBoundaries(w.services.geoStore, alberta2019Source());
  });

  it("resolves a posting participant (authorPubkey/Pₜ, no nullifier) to their seeded riding", async () => {
    const m = await enrolledMember(w, "pg-edm@example.com", "edm");
    await m.client.createPost(m.t, { title: "Test post", body: "hello edmonton" });
    await seedPoint(w, m.userId, EDMONTON_LEGISLATURE);

    const geo = await w.services.participantGeoService.resolveParticipant(
      { authorPubkey: m.sess.personaPubkey(m.t) },
      JURISDICTION,
      ASOF,
    );
    expect(geo.userId).to.equal(m.userId);
    expect(geo.hasPoint).to.equal(true);
    expect(geo.districtId).to.equal(EDMONTON_CITY_CENTRE_2019);
  });

  it("resolves a second participant in a different riding to a different district", async () => {
    const m = await enrolledMember(w, "pg-cal@example.com", "cal");
    await m.client.createPost(m.t, { title: "Test post", body: "hello calgary" });
    await seedPoint(w, m.userId, CALGARY_CITY_HALL);

    const geo = await w.services.participantGeoService.resolveParticipant(
      { authorPubkey: m.sess.personaPubkey(m.t) },
      JURISDICTION,
      ASOF,
    );
    expect(geo.userId).to.equal(m.userId);
    expect(geo.districtId).to.equal(CALGARY_BUFFALO_2019);
  });

  it("resolves a singleton (vote) participant via its nullifier + parentId", async () => {
    const m = await enrolledMember(w, "pg-vote@example.com", "vote");
    await m.client.append(m.t, {
      op: "create", type: "poll", entityId: m.threadId,
      content: { question: "Fix the road?", options: ["yes", "no"] },
    });
    const ref = await m.client.castVote(m.t, { type: "poll", id: m.threadId }, { option: "yes" });

    const head = await w.services.recordStore.getHeadTx(ref.entityId);
    expect(head!.type).to.equal("vote");
    expect(head!.nullifier, "vote carries a nullifier").to.be.a("string");
    expect(head!.parentId).to.equal(m.threadId);
    await seedPoint(w, m.userId, EDMONTON_LEGISLATURE);

    const geo = await w.services.participantGeoService.resolveParticipant(
      { nullifier: head!.nullifier!, parentId: head!.parentId! },
      JURISDICTION,
      ASOF,
    );
    expect(geo.userId).to.equal(m.userId);
    expect(geo.districtId).to.equal(EDMONTON_CITY_CENTRE_2019);

    // A nullifier WITHOUT its parentId is intentionally unresolved (the lookup key is the pair).
    expect(await w.services.participantGeoService.resolveUserId({ nullifier: head!.nullifier! })).to.equal(null);
  });

  it("a participant with no geocode row resolves to hasPoint:false (out-of-area, not an error)", async () => {
    const m = await enrolledMember(w, "pg-nopoint@example.com", "nopoint");
    await m.client.createPost(m.t, { title: "Test post", body: "no address on file" });

    const geo = await w.services.participantGeoService.resolveParticipant(
      { authorPubkey: m.sess.personaPubkey(m.t) },
      JURISDICTION,
      ASOF,
    );
    expect(geo.userId).to.equal(m.userId);
    expect(geo.hasPoint).to.equal(false);
    expect(geo.districtId).to.equal(null);
  });

  it("an unknown participant key resolves to userId:null, hasPoint:false", async () => {
    const bogus = "02" + "f".repeat(64); // valid-shaped pubkey, never registered
    const geo = await w.services.participantGeoService.resolveParticipant(
      { authorPubkey: bogus },
      JURISDICTION,
      ASOF,
    );
    expect(geo.userId).to.equal(null);
    expect(geo.hasPoint).to.equal(false);
    expect(geo.districtId).to.equal(null);
  });

  it("viewerDistrictId matches the seeded riding, and is null without a point", async () => {
    const m = await enrolledMember(w, "pg-viewer@example.com", "viewer");
    await seedPoint(w, m.userId, EDMONTON_LEGISLATURE);

    expect(await w.services.participantGeoService.viewerDistrictId(m.userId, JURISDICTION, ASOF))
      .to.equal(EDMONTON_CITY_CENTRE_2019);

    // A user with no cached point has no viewer district (inert my-district downstream).
    expect(await w.services.participantGeoService.viewerDistrictId(randomUUID(), JURISDICTION, ASOF))
      .to.equal(null);
  });

  it("participantInRegion: region-first membership over a compiled impacted-region scope", async () => {
    // The C7 path: derive ONE Region for the discussion's impacted area, then test membership with
    // region.contains — never by comparing districtId strings.
    const region = await w.services.regionResolver.compileScope({
      scope: "impacted-region",
      jurisdictionId: JURISDICTION,
      appliesToDistrictIds: [EDMONTON_CITY_CENTRE_2019],
      asOf: ASOF,
    });
    expect(region, "impacted-region compiles to a Region").to.not.equal(null);

    const inside = await enrolledMember(w, "pg-region-in@example.com", "region-in");
    await inside.client.createPost(inside.t, { title: "Test post", body: "from inside the riding" });
    await seedPoint(w, inside.userId, EDMONTON_LEGISLATURE);
    expect(await w.services.participantGeoService.participantInRegion(
      { authorPubkey: inside.sess.personaPubkey(inside.t) }, region!,
    )).to.equal(true);

    const outside = await enrolledMember(w, "pg-region-out@example.com", "region-out");
    await outside.client.createPost(outside.t, { title: "Test post", body: "from another riding" });
    await seedPoint(w, outside.userId, CALGARY_CITY_HALL);
    expect(await w.services.participantGeoService.participantInRegion(
      { authorPubkey: outside.sess.personaPubkey(outside.t) }, region!,
    )).to.equal(false);
  });

  it("participantInRegion: no point and unlinked participants are out-of-area (false, not an error)", async () => {
    const region = await w.services.regionResolver.compileScope({
      scope: "impacted-region",
      jurisdictionId: JURISDICTION,
      appliesToDistrictIds: [EDMONTON_CITY_CENTRE_2019],
      asOf: ASOF,
    });

    // Linked participant but no cached point ⇒ false.
    const m = await enrolledMember(w, "pg-region-nopoint@example.com", "region-nopoint");
    await m.client.createPost(m.t, { title: "Test post", body: "no address on file" });
    expect(await w.services.participantGeoService.participantInRegion(
      { authorPubkey: m.sess.personaPubkey(m.t) }, region!,
    )).to.equal(false);

    // Unknown participant key ⇒ false (no link, no point).
    const bogus = "02" + "f".repeat(64);
    expect(await w.services.participantGeoService.participantInRegion({ authorPubkey: bogus }, region!))
      .to.equal(false);
  });
});
