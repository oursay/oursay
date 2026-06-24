// The compileScope stub seam: coarse GeoScope → Region (or null). This is what the public read service
// will consume later; it is NOT wired to any route. Asserts the mapping and the inert my-district case.

import { expect } from "chai";
import {
  CALGARY_BUFFALO_2019,
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

describe("03 geo: compileScope stub (GeoScope → Region)", () => {
  let store: GeoStore;
  let reg: RegionResolver;

  before(async () => {
    store = await getStore();
    await store.reset();
    await ingestBoundaries(store, alberta2019Source());
    reg = resolver(store);
  });

  it("all-public → null (no geo filter)", async () => {
    expect(await reg.compileScope({ scope: "all-public", jurisdictionId: JURISDICTION })).to.equal(null);
  });

  it("my-district → null when there is no viewer (inert on public routes)", async () => {
    expect(await reg.compileScope({ scope: "my-district", jurisdictionId: JURISDICTION })).to.equal(null);
  });

  it("my-district → the viewer's district when provided", async () => {
    const region = await reg.compileScope({
      scope: "my-district",
      jurisdictionId: JURISDICTION,
      viewerDistrictId: EDMONTON_CITY_CENTRE_2019,
    });
    expect(region).to.not.equal(null);
    expect(await region!.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await region!.contains(TORONTO)).to.equal(false);
  });

  it("jurisdiction → whole-jurisdiction extent at asOf", async () => {
    const region = await reg.compileScope({
      scope: "jurisdiction",
      jurisdictionId: JURISDICTION,
      asOf: new Date("2020-01-01"),
    });
    expect(region!.kind).to.equal("jurisdiction");
    expect(region!.districtIds).to.have.length(87);
  });

  it("impacted-region → union of appliesToDistrictIds", async () => {
    const region = await reg.compileScope({
      scope: "impacted-region",
      jurisdictionId: JURISDICTION,
      appliesToDistrictIds: [EDMONTON_CITY_CENTRE_2019, CALGARY_BUFFALO_2019],
    });
    expect(region!.kind).to.equal("district_union");
    expect(await region!.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await region!.contains(TORONTO)).to.equal(false);
  });

  it("impacted-region with no districts → whole jurisdiction at asOf", async () => {
    const region = await reg.compileScope({
      scope: "impacted-region",
      jurisdictionId: JURISDICTION,
      appliesToDistrictIds: [],
      asOf: new Date("2020-01-01"),
    });
    expect(region!.kind).to.equal("jurisdiction");
    expect(region!.districtIds).to.have.length(87);
  });
});
