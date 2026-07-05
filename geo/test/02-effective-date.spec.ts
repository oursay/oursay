// Effective-dated resolution / redraw. Ingest the SAME ridings under two effective dates in the same
// calendar year (the second set gets a `-2` revision-id suffix). Assert that forJurisdiction(asOf)
// selects the older revision for an early asOf and the newer for a later asOf — proving revisions
// coexist and `effective_date` (not the year label) drives selection.

import { expect } from "chai";
import {
  EDMONTON_CITY_CENTRE_2019,
  EDMONTON_LEGISLATURE,
  JURISDICTION,
  alberta2019Source,
  getStore,
  resolver,
} from "./helpers/world.js";
import { ingestBoundaries } from "../src/ingest/source.js";
import type { GeoStore } from "../src/store.js";
import type { RegionResolver } from "../src/region-resolver.js";

const NEWER_REVISION = "edmonton-city-centre-2019-2";

describe("02 geo: effective-dated redraw selection", () => {
  let store: GeoStore;
  let reg: RegionResolver;

  before(async () => {
    store = await getStore();
    await store.reset();
    await ingestBoundaries(store, alberta2019Source({ effectiveDate: "2019-04-16", boundaryYear: 2019 }));
    // A second boundary set the same year → suffixed revision ids, distinct effective_date.
    await ingestBoundaries(store, alberta2019Source({ effectiveDate: "2019-10-01", boundaryYear: 2019 }));
    reg = resolver(store);
  });

  it("creates a suffixed second revision per riding (revisions coexist)", async () => {
    expect(await store.districtExists(EDMONTON_CITY_CENTRE_2019)).to.equal(true);
    expect(await store.districtExists(NEWER_REVISION)).to.equal(true);
    expect(await store.countDistricts(JURISDICTION)).to.equal(87 * 2);
  });

  it("asOf before the second set resolves to the OLDER revision", async () => {
    const region = await reg.forJurisdiction(JURISDICTION, new Date("2019-05-01"));
    expect(region.districtIds).to.include(EDMONTON_CITY_CENTRE_2019);
    expect(region.districtIds).to.not.include(NEWER_REVISION);
    expect(region.districtIds).to.have.length(87); // one revision per riding
    expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
  });

  it("asOf after the second set resolves to the NEWER revision", async () => {
    const region = await reg.forJurisdiction(JURISDICTION, new Date("2019-11-01"));
    expect(region.districtIds).to.include(NEWER_REVISION);
    expect(region.districtIds).to.not.include(EDMONTON_CITY_CENTRE_2019);
    expect(region.districtIds).to.have.length(87);
    expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
  });

  it("asOf before ANY effective date resolves to an empty extent", async () => {
    const region = await reg.forJurisdiction(JURISDICTION, new Date("2000-01-01"));
    expect(region.districtIds).to.have.length(0);
    expect(region.isEmpty).to.equal(true);
    expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(false);
  });
});
