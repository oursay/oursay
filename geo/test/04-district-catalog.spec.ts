// District catalog queries backing the public area catalog API: listDistrictsAsOf returns one
// metadata row per riding under the SAME effective-dated rule as forJurisdiction, and
// getDistrictGeometry returns the stored 4326 GeoJSON for ANY revision by id (including superseded
// redraws). Ingest the real 2019 Alberta set plus a same-year redraw to exercise asOf selection.

import { expect } from "chai";
import {
  EDMONTON_CITY_CENTRE_2019,
  JURISDICTION,
  alberta2019Source,
  getStore,
} from "./helpers/world.js";
import { ingestBoundaries } from "../src/ingest/source.js";
import type { GeoStore } from "../src/store.js";

const NEWER_REVISION = "edmonton-city-centre-2019-2";

describe("04 geo: district catalog (listDistrictsAsOf + getDistrictGeometry)", () => {
  let store: GeoStore;

  before(async function () {
    this.timeout(60000);
    store = await getStore();
    await store.reset();
    await ingestBoundaries(store, alberta2019Source({ effectiveDate: "2019-04-16", boundaryYear: 2019 }));
    // A same-year redraw: suffixed revision ids, a later effective_date.
    await ingestBoundaries(store, alberta2019Source({ effectiveDate: "2019-10-01", boundaryYear: 2019 }));
  });

  it("lists one revision per riding at asOf, ordered by name", async () => {
    const rows = await store.listDistrictsAsOf(JURISDICTION, new Date("2020-01-01"));
    expect(rows).to.have.length(87);
    const names = rows.map((r) => r.name);
    expect(names).to.deep.equal([...names].sort());
    const ecc = rows.find((r) => r.ridingSlug === "edmonton-city-centre");
    expect(ecc).to.exist;
    expect(ecc!.id).to.equal(NEWER_REVISION); // latest effective_date wins by 2020
    expect(ecc!.effectiveDate).to.equal("2019-10-01");
    expect(ecc!.drawnDate).to.equal("2017-12-15");
    expect(ecc!.source).to.be.a("string").and.not.empty;
  });

  it("selects the OLDER revision for an asOf before the redraw", async () => {
    const rows = await store.listDistrictsAsOf(JURISDICTION, new Date("2019-05-01"));
    const ecc = rows.find((r) => r.ridingSlug === "edmonton-city-centre");
    expect(ecc!.id).to.equal(EDMONTON_CITY_CENTRE_2019);
    expect(ecc!.effectiveDate).to.equal("2019-04-16");
  });

  it("returns an empty list before any effective date", async () => {
    const rows = await store.listDistrictsAsOf(JURISDICTION, new Date("2000-01-01"));
    expect(rows).to.have.length(0);
  });

  it("omits geometry by default and embeds it with includeGeometry", async () => {
    const meta = await store.listDistrictsAsOf(JURISDICTION, new Date("2020-01-01"));
    expect(meta[0]).to.not.have.property("geometry");
    const withGeom = await store.listDistrictsAsOf(JURISDICTION, new Date("2020-01-01"), {
      includeGeometry: true,
    });
    const g = withGeom[0].geometry as { type: string; coordinates: unknown[] };
    expect(g.type).to.equal("MultiPolygon");
    expect(g.coordinates).to.be.an("array").and.not.empty;
  });

  it("returns GeoJSON geometry for a revision by id, including a superseded one", async () => {
    const current = (await store.getDistrictGeometry(NEWER_REVISION)) as { type: string };
    expect(current.type).to.equal("MultiPolygon");
    // The 2019-04-16 revision is superseded by 2020 but still fetchable by id (audit).
    const superseded = (await store.getDistrictGeometry(EDMONTON_CITY_CENTRE_2019)) as {
      type: string;
      coordinates: unknown[];
    };
    expect(superseded.type).to.equal("MultiPolygon");
    expect(superseded.coordinates).to.be.an("array").and.not.empty;
  });

  it("returns null geometry for an unknown revision id", async () => {
    expect(await store.getDistrictGeometry("no-such-riding-2019")).to.equal(null);
  });

  it("maps a revision id to its jurisdiction (null when unknown)", async () => {
    expect(await store.districtJurisdiction(EDMONTON_CITY_CENTRE_2019)).to.equal(JURISDICTION);
    expect(await store.districtJurisdiction("no-such-riding-2019")).to.equal(null);
  });
});
