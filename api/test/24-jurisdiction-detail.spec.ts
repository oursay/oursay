// W4 easy lane (Task #10): P7 jurisdiction detail + P8 district-by-slug detail.

import { join } from "node:path";
import { expect } from "chai";

import { ingestBoundaries, paths, ShapefileSource } from "@oursay/geo";
import { resetWorld, type World } from "./helpers/world.js";

const JURISDICTION = "ab-ca-gov";
const EDMONTON_SLUG = "edmonton-city-centre";

const ALBERTA_2019_SHP = join(
  paths.repoRoot,
  "jurisdiction-data",
  "ab-ca-gov",
  "districts",
  "ElectionsAlberta",
  "2019",
  "EDS_ENACTED_BILL33_15DEC2017.shp",
);

function alberta2019Source(effectiveDate: string): ShapefileSource {
  return new ShapefileSource({
    sourceId: "test/ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
    jurisdictionId: JURISDICTION,
    effectiveDate,
    drawnDate: "2017-12-15",
    boundaryYear: 2019,
    srid: 3401,
    shpPath: ALBERTA_2019_SHP,
    fieldMap: { name: "EDName2017", ref: "EDNumber20" },
  });
}

async function get(w: World, url: string): Promise<{ status: number; body: any }> {
  const res = await w.app.inject({ method: "GET", url });
  return { status: res.statusCode, body: res.json() };
}

describe("24 jurisdiction detail: P7 jurisdiction + P8 district by slug", () => {
  let w: World;

  before(async function () {
    this.timeout(60000);
    w = await resetWorld();
    await w.services.geoStore.reset();
    await ingestBoundaries(w.services.geoStore, alberta2019Source("2019-04-16"));
    await ingestBoundaries(w.services.geoStore, alberta2019Source("2019-10-01"));
  });

  it("GET /v1/public/jurisdictions/:id returns gates, graduationThreshold, leader, rulesCopy — no policy internals", async () => {
    const global = await get(w, "/v1/public/jurisdictions/oursay-global");
    expect(global.status).to.equal(200);
    expect(global.body.id).to.equal("oursay-global");
    expect(global.body.level).to.equal("federal");
    expect(global.body.label).to.equal("OurSay Global");
    expect(global.body.graduationThreshold).to.equal(100);
    expect(global.body.leader).to.deep.equal({
      name: "OurSay Stewards",
      handle: "global-platform",
    });
    expect(global.body.rulesCopy).to.be.an("array").with.length.greaterThan(0);
    expect(global.body.gates.vote.signMin).to.equal("quick");
    expect(global.body).to.not.have.any.keys("rules", "counts", "privacy", "contentLimits");

    const ab = await get(w, "/v1/public/jurisdictions/ab-ca-gov");
    expect(ab.status).to.equal(200);
    expect(ab.body.label).to.equal("Alberta");
    expect(ab.body.labels.district).to.equal("riding");
    expect(ab.body.graduationThreshold).to.equal(null);
    expect(ab.body.leader.name).to.equal("Danielle Smith");
    expect(ab.body.gates.poll.act).to.deep.equal({ role: "official" });
  });

  it("GET /v1/public/jurisdictions/:id 404s unknown jurisdiction", async () => {
    const { status, body } = await get(w, "/v1/public/jurisdictions/no-such-jurisdiction");
    expect(status).to.equal(404);
    expect(body.error.code).to.equal("not_found");
  });

  it("GET /v1/public/jurisdictions/:id/districts/:slug returns district detail with nullable leader/about", async () => {
    const { status, body } = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts/${EDMONTON_SLUG}?asOf=2020-01-01`);
    expect(status).to.equal(200);
    expect(body.name).to.equal("Edmonton-City Centre");
    expect(body.slug).to.equal(EDMONTON_SLUG);
    expect(body.jur).to.equal(JURISDICTION);
    expect(body.boundaryYear).to.equal(2019);
    expect(body.effectiveDate).to.equal("2019-10-01");
    expect(body.sourceName).to.be.a("string").and.not.empty;
    expect(body.leader).to.equal("David Shepherd");
    expect(body.leaderHandle).to.equal("ab-edm_city_cen");
    expect(body.leaderClaimed).to.equal(false);
    expect(body.about).to.equal(null);
  });

  it("P8 respects asOf when selecting the effective revision", async () => {
    const before = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts/${EDMONTON_SLUG}?asOf=2019-05-01`);
    const after = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts/${EDMONTON_SLUG}?asOf=2019-11-01`);
    expect(before.body.effectiveDate).to.equal("2019-04-16");
    expect(after.body.effectiveDate).to.equal("2019-10-01");
  });

  it("GET /v1/public/jurisdictions/:id/districts/:slug 404s unknown slug", async () => {
    const { status } = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts/no-such-riding`);
    expect(status).to.equal(404);
  });
});
