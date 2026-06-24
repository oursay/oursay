// Ingest the real 2019 Alberta boundaries and assert Region.contains() over known coordinates for the
// required region kinds (single district, district union, jurisdiction extent) plus a custom preset.
// Idempotency: re-ingesting the same set is a no-op upsert.

import { expect } from "chai";
import {
  CALGARY_BUFFALO_2019,
  CALGARY_CITY_HALL,
  EDMONTON_CITY_CENTRE_2019,
  EDMONTON_LEGISLATURE,
  JURISDICTION,
  TORONTO,
  alberta2019Source,
  getStore,
  resolver,
} from "./helpers/world.js";
import { ingestBoundaries } from "../src/ingest/source.js";
import type { GeoStore } from "../src/store.js";
import type { RegionResolver } from "../src/region-resolver.js";

describe("01 geo: ingest + Region.contains over real Alberta boundaries", () => {
  let store: GeoStore;
  let reg: RegionResolver;

  before(async () => {
    store = await getStore();
    await store.reset();
    const result = await ingestBoundaries(store, alberta2019Source());
    expect(result.count).to.equal(87);
    reg = resolver(store);
  });

  it("ingests 87 districts and re-ingesting the same set is idempotent", async () => {
    expect(await store.countDistricts(JURISDICTION)).to.equal(87);
    await ingestBoundaries(store, alberta2019Source()); // same effective_date → overwrite in place
    expect(await store.countDistricts(JURISDICTION)).to.equal(87);
  });

  it("single-district region: contains its point, excludes others", async () => {
    const region = await reg.resolve(EDMONTON_CITY_CENTRE_2019);
    expect(region.kind).to.equal("district");
    expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await region.contains(CALGARY_CITY_HALL)).to.equal(false);
    expect(await region.contains(TORONTO)).to.equal(false);
  });

  it("district-union region: contains a point inside any member", async () => {
    const region = reg.fromDistrictUnion([EDMONTON_CITY_CENTRE_2019, CALGARY_BUFFALO_2019], JURISDICTION);
    expect(region.kind).to.equal("district_union");
    expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await region.contains(CALGARY_CITY_HALL)).to.equal(true);
    expect(await region.contains(TORONTO)).to.equal(false);
  });

  it("jurisdiction-extent region: all 87 ridings; inside Alberta true, outside false", async () => {
    const region = await reg.forJurisdiction(JURISDICTION, new Date("2020-01-01"));
    expect(region.kind).to.equal("jurisdiction");
    expect(region.districtIds).to.have.length(87);
    expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await region.contains(CALGARY_CITY_HALL)).to.equal(true);
    expect(await region.contains(TORONTO)).to.equal(false);
  });

  it("custom preset region: resolves and contains points in its stored geometry", async () => {
    // A small box around Edmonton stored as a custom region.
    await store.pool.query(
      `INSERT INTO geo.regions (id, jurisdiction_id, kind, name, geom)
       VALUES ('test-edmonton-box', $1, 'custom', 'Edmonton box',
               ST_Multi(ST_SetSRID(ST_MakeEnvelope(-113.7, 53.4, -113.3, 53.7), 4326)))
       ON CONFLICT (id) DO NOTHING`,
      [JURISDICTION],
    );
    const region = await reg.resolve("test-edmonton-box");
    expect(region.kind).to.equal("custom");
    expect(region.hasOwnGeom).to.equal(true);
    expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await region.contains(CALGARY_CITY_HALL)).to.equal(false);
  });

  it("unknown region id rejects", async () => {
    let threw = false;
    try {
      await reg.resolve("no-such-region");
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
