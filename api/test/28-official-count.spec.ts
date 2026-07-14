// [align-w4-api-surface] P9 — official count gate (?official=true) on the public count endpoints.
// When official=true, counts include only participants who satisfy gates[action].officialCount
// (fallback act) minus deny[] exclusions (e.g. AB officials on petition_signature).

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublicChain, RecordService } from "@oursay/public-record";
import { ingestBoundaries, paths, ShapefileSource } from "@oursay/geo";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

const GLOBAL = "oursay-global";
const AB = "ab-ca-gov";
const EDMONTON = { lon: -113.5065, lat: 53.5333 };

const ALBERTA_2019_SHP = join(
  paths.repoRoot,
  "jurisdiction-data",
  "ab-ca-gov",
  "districts",
  "ElectionsAlberta",
  "2019",
  "EDS_ENACTED_BILL33_15DEC2017.shp",
);

function seeder(w: World, chainId = randomUUID()): RecordService {
  return new RecordService(
    new PublicChain(w.services.recordStore, chainId, w.services.ledger, w.services.connectLedger),
    w.services.recordStore,
  );
}

async function link(w: World, pubkey: string, userId: string, threadId: string, jurisdiction: string) {
  await w.services.recordStore.registerThreadBinding({
    threadPubkey: pubkey,
    userId,
    threadId,
    jurisdiction,
    commitment: `c-${pubkey}`,
    bindingSig: `sig-${pubkey}`,
  });
}

async function seedPoint(w: World, userId: string, point: { lon: number; lat: number }) {
  await w.services.repos.geocode.upsertCurrent({
    userId,
    addressHash: `seed:${userId}`,
    lon: point.lon,
    lat: point.lat,
    provider: "stub",
    confidence: 0.5,
  });
}

async function pollCounts(w: World, id: string, query = "") {
  const res = await w.app.inject({ method: "GET", url: `/v1/public/polls/${id}/counts${query}` });
  expect(res.statusCode, res.payload).to.equal(200);
  return res.json();
}

async function petitionCounts(w: World, id: string, query = "") {
  const res = await w.app.inject({ method: "GET", url: `/v1/public/petitions/${id}/counts${query}` });
  expect(res.statusCode, res.payload).to.equal(200);
  return res.json();
}

describe("28 official count gate: ?official=true on count endpoints", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN;
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT;
    process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN = "0";
    process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT = "0";
  });

  afterEach(() => {
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN;
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT;
  });

  it("global poll: official count excludes unverified voters (ID-or-better floor)", async () => {
    const svc = seeder(w);
    const poll = await svc.create({
      type: "poll",
      author: "pk-author",
      content: { question: "Q?", options: ["yes", "no"] },
    });

    const unverified = await makeAccount(w, { handle: "@unv" });
    const idVerified = await makeAccount(w, { handle: "@idv" });
    const resVerified = await makeAccount(w, { handle: "@res" });
    await w.services.recordStore.putAttestation({ userId: idVerified.userId, provider: "stub", tier: "identity_verified" });
    await w.services.recordStore.putAttestation({ userId: resVerified.userId, provider: "stub", tier: "residency_verified" });

    await link(w, "pk-unv", unverified.userId, poll.entityId, GLOBAL);
    await link(w, "pk-idv", idVerified.userId, poll.entityId, GLOBAL);
    await link(w, "pk-res", resVerified.userId, poll.entityId, GLOBAL);
    await svc.vote("pk-unv", poll.entityId, "yes");
    await svc.vote("pk-idv", poll.entityId, "yes");
    await svc.vote("pk-res", poll.entityId, "yes");

    const live = await pollCounts(w, poll.entityId);
    expect(live.results.find((r: any) => r.option === "yes")?.count).to.equal(3);

    const official = await pollCounts(w, poll.entityId, "?official=true");
    expect(official.results.find((r: any) => r.option === "yes")?.count).to.equal(2);
    expect(official.filters.official).to.equal(true);
    expect(official.filters.applied.official).to.equal(true);
  });

  it("AB petition: official count excludes officials (deny) and unverified signers (residency floor)", async function () {
    this.timeout(60000);
    await ingestBoundaries(
      w.services.geoStore,
      new ShapefileSource({
        sourceId: "test/ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
        jurisdictionId: AB,
        effectiveDate: "2019-04-16",
        drawnDate: "2017-12-15",
        boundaryYear: 2019,
        srid: 3401,
        shpPath: ALBERTA_2019_SHP,
        fieldMap: { name: "EDName2017", ref: "EDNumber20" },
      }),
    );

    const svc = seeder(w);
    const pet = await svc.create({
      type: "petition",
      author: "pk-pet",
      content: { title: "Fix road", text: "please" },
    });

    const resident = await makeAccount(w, { handle: "@res" });
    const official = await makeAccount(w, { handle: "@off" });
    const unverified = await makeAccount(w, { handle: "@unv" });
    await w.services.recordStore.putAttestation({ userId: resident.userId, provider: "stub", tier: "residency_verified" });
    await w.services.recordStore.putAttestation({ userId: official.userId, provider: "stub", tier: "residency_verified" });
    await seedPoint(w, resident.userId, EDMONTON);
    await seedPoint(w, official.userId, EDMONTON);
    await w.services.repos.membership.setRole(official.userId, AB, "official", "edmonton-city-centre-2019");

    await link(w, "pk-res", resident.userId, pet.entityId, AB);
    await link(w, "pk-off", official.userId, pet.entityId, AB);
    await link(w, "pk-unv", unverified.userId, pet.entityId, AB);
    await svc.sign("pk-res", pet.entityId);
    await svc.sign("pk-off", pet.entityId);
    await svc.sign("pk-unv", pet.entityId);

    const tierQuery = "?tier=residency_verified";
    const verifiedOnly = await petitionCounts(w, pet.entityId, tierQuery);
    expect(verifiedOnly.signatureCount).to.equal(2);

    const officialOnly = await petitionCounts(w, pet.entityId, `${tierQuery}&official=true`);
    expect(officialOnly.signatureCount).to.equal(1);
    expect(officialOnly.filters.applied.official).to.equal(true);
  });
});
