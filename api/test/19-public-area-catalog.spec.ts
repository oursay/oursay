// Public, unauthenticated AREA CATALOG (/v1/public/jurisdictions + .../districts[/:id/geometry]).
// Closes [mvp-c6-area-catalog]. We ingest the REAL 2019 Alberta boundaries (plus a same-year redraw)
// into the shared GeoStore and assert: the jurisdiction index, the effective-dated district directory
// (asOf before/after the redraw), the official GeoJSON geometry endpoint (including a superseded
// revision), the include=geometry payload, and the empty-list / 404 / bad-asOf edges.
//
// NOTE on geo test isolation: the `before` hook calls `geoStore.reset()` to make the ingest (and the
// exact revision-id set) deterministic. The GeoStore is shared across the api test world and is NOT
// reset by `resetWorld()` (which only truncates auth + account rows), so running this spec in
// isolation is safe, and because it runs LAST in filename order it does not disturb the geo-dependent
// specs 15-18 that precede it.

import { join } from "node:path";
import { expect } from "chai";

import { ingestBoundaries, paths, ShapefileSource } from "@oursay/geo";
import { resetWorld, type World } from "./helpers/world.js";

const JURISDICTION = "ab-ca-gov";
const EDMONTON_CITY_CENTRE_2019 = "edmonton-city-centre-2019";
const EDMONTON_CITY_CENTRE_REDRAW = "edmonton-city-centre-2019-2";

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

describe("19 public area catalog", () => {
  let w: World;

  before(async function () {
    this.timeout(60000);
    w = await resetWorld();
    await w.services.geoStore.reset();
    await ingestBoundaries(w.services.geoStore, alberta2019Source("2019-04-16"));
    // A same-year redraw: suffixed revision ids, later effective_date — exercises asOf selection.
    await ingestBoundaries(w.services.geoStore, alberta2019Source("2019-10-01"));
  });

  it("lists registered jurisdictions with labels and no policy fields", async () => {
    const { status, body } = await get(w, "/v1/public/jurisdictions");
    expect(status).to.equal(200);
    const ids = body.items.map((j: any) => j.id);
    expect(ids).to.include.members(["ab-ca-gov", "oursay-global"]);
    const ab = body.items.find((j: any) => j.id === "ab-ca-gov");
    expect(ab).to.deep.equal({ id: "ab-ca-gov", level: "provincial", label: "Alberta" });
    for (const j of body.items) {
      expect(j).to.not.have.any.keys("rules", "counts", "privacy");
    }
  });

  it("returns the district directory (metadata only) at a given asOf", async () => {
    const { status, body } = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts?asOf=2020-01-01`);
    expect(status).to.equal(200);
    expect(body.jurisdictionId).to.equal(JURISDICTION);
    expect(body.asOf).to.equal("2020-01-01");
    expect(body.items).to.have.length(87);
    const ecc = body.items.find((d: any) => d.ridingSlug === "edmonton-city-centre");
    expect(ecc.name).to.equal("Edmonton-City Centre");
    expect(ecc.id).to.equal(EDMONTON_CITY_CENTRE_REDRAW); // latest effective_date by 2020
    expect(ecc).to.not.have.property("geometry");
    expect(ecc).to.not.have.property("boundaryYear");
  });

  it("resolves the effective-dated revision before vs after a redraw", async () => {
    const before = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts?asOf=2019-05-01`);
    const after = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts?asOf=2019-11-01`);
    const eccBefore = before.body.items.find((d: any) => d.ridingSlug === "edmonton-city-centre");
    const eccAfter = after.body.items.find((d: any) => d.ridingSlug === "edmonton-city-centre");
    expect(eccBefore.id).to.equal(EDMONTON_CITY_CENTRE_2019);
    expect(eccBefore.effectiveDate).to.equal("2019-04-16");
    expect(eccAfter.id).to.equal(EDMONTON_CITY_CENTRE_REDRAW);
    expect(eccAfter.effectiveDate).to.equal("2019-10-01");
  });

  it("embeds GeoJSON on each item when include=geometry", async () => {
    const { status, body } = await get(
      w,
      `/v1/public/jurisdictions/${JURISDICTION}/districts?asOf=2020-01-01&include=geometry`,
    );
    expect(status).to.equal(200);
    const g = body.items[0].geometry;
    expect(g.type).to.equal("MultiPolygon");
    expect(g.coordinates).to.be.an("array").and.not.empty;
  });

  it("returns 200 with an empty list for a registered jurisdiction with no boundaries", async () => {
    const { status, body } = await get(w, "/v1/public/jurisdictions/oursay-global/districts");
    expect(status).to.equal(200);
    expect(body.jurisdictionId).to.equal("oursay-global");
    expect(body.items).to.deep.equal([]);
  });

  it("404s an unknown jurisdiction", async () => {
    const { status, body } = await get(w, "/v1/public/jurisdictions/no-such-jurisdiction/districts");
    expect(status).to.equal(404);
    expect(body.error.code).to.equal("not_found");
  });

  it("400s a malformed asOf", async () => {
    const { status } = await get(w, `/v1/public/jurisdictions/${JURISDICTION}/districts?asOf=not-a-date`);
    expect(status).to.equal(400);
  });

  it("returns official GeoJSON for a district revision by id", async () => {
    const { status, body } = await get(
      w,
      `/v1/public/jurisdictions/${JURISDICTION}/districts/${EDMONTON_CITY_CENTRE_REDRAW}/geometry`,
    );
    expect(status).to.equal(200);
    expect(body.type).to.equal("MultiPolygon");
    expect(body.coordinates).to.be.an("array").and.not.empty;
  });

  it("returns geometry for a SUPERSEDED revision (audit path), not just the current effective set", async () => {
    const { status, body } = await get(
      w,
      `/v1/public/jurisdictions/${JURISDICTION}/districts/${EDMONTON_CITY_CENTRE_2019}/geometry`,
    );
    expect(status).to.equal(200);
    expect(body.type).to.equal("MultiPolygon");
  });

  it("404s an unknown revision id", async () => {
    const { status } = await get(
      w,
      `/v1/public/jurisdictions/${JURISDICTION}/districts/no-such-riding-2019/geometry`,
    );
    expect(status).to.equal(404);
  });

  it("404s a revision that belongs to a different jurisdiction", async () => {
    const { status } = await get(
      w,
      `/v1/public/jurisdictions/oursay-global/districts/${EDMONTON_CITY_CENTRE_2019}/geometry`,
    );
    expect(status).to.equal(404);
  });
});
