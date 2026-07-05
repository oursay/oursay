// resolveRegionRef: the EntityRules.appliesToRegion stake → Region. Exercises the full ref vocabulary
// against the REAL 2019 Alberta boundaries plus a same-year redraw (so a stable district_slug resolves
// to DIFFERENT revisions across an effective-date boundary), and the and/or/not composite algebra.

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

const ECC_SLUG = "edmonton-city-centre";
const ECC_REVISION_2 = "edmonton-city-centre-2019-2"; // same-year redraw, later effective_date
const BEFORE_REDRAW = new Date("2019-05-01");
const AFTER_REDRAW = new Date("2020-01-01");

describe("05 geo: resolveRegionRef (appliesToRegion stake → Region)", () => {
  let store: GeoStore;
  let reg: RegionResolver;

  before(async function () {
    this.timeout(60000);
    store = await getStore();
    await store.reset();
    await ingestBoundaries(store, alberta2019Source({ effectiveDate: "2019-04-16", boundaryYear: 2019 }));
    await ingestBoundaries(store, alberta2019Source({ effectiveDate: "2019-10-01", boundaryYear: 2019 }));
    reg = resolver(store);
  });

  describe("base refs", () => {
    it('"jurisdiction" → whole jurisdiction extent at asOf', async () => {
      const region = await reg.resolveRegionRef("jurisdiction", { jurisdictionId: JURISDICTION, asOf: AFTER_REDRAW });
      expect(region.kind).to.equal("jurisdiction");
      expect(region.districtIds).to.have.length(87);
    });

    it('"district:<district_slug>" resolves the stable seat to the revision in force at asOf', async () => {
      const before = await reg.resolveRegionRef(`district:${ECC_SLUG}`, { jurisdictionId: JURISDICTION, asOf: BEFORE_REDRAW });
      expect(before.districtIds).to.deep.equal([EDMONTON_CITY_CENTRE_2019]);
      expect(await before.contains(EDMONTON_LEGISLATURE)).to.equal(true);

      const after = await reg.resolveRegionRef(`district:${ECC_SLUG}`, { jurisdictionId: JURISDICTION, asOf: AFTER_REDRAW });
      expect(after.districtIds).to.deep.equal([ECC_REVISION_2]); // the redraw revision now in force
      expect(await after.contains(EDMONTON_LEGISLATURE)).to.equal(true); // same seat, still contains the point
    });

    it('"revision:<revisionId>" pins a specific boundary version regardless of asOf', async () => {
      const region = await reg.resolveRegionRef(`revision:${EDMONTON_CITY_CENTRE_2019}`, {
        jurisdictionId: JURISDICTION,
        asOf: AFTER_REDRAW, // a newer revision exists, but the pin holds
      });
      expect(region.districtIds).to.deep.equal([EDMONTON_CITY_CENTRE_2019]);
      expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    });

    it('"district:<slug>" with no revision in force at asOf → empty region (contains() false)', async () => {
      const region = await reg.resolveRegionRef(`district:${ECC_SLUG}`, {
        jurisdictionId: JURISDICTION,
        asOf: new Date("2000-01-01"),
      });
      expect(region.isEmpty).to.equal(true);
      expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(false);
    });
  });

  describe("union composition (and / or / not)", () => {
    it('OR over district-based refs COLLAPSES to a district_union', async () => {
      const region = await reg.resolveRegionRef(
        { op: "or", refs: [`revision:${EDMONTON_CITY_CENTRE_2019}`, `revision:${CALGARY_BUFFALO_2019}`] },
        { jurisdictionId: JURISDICTION, asOf: BEFORE_REDRAW },
      );
      expect(region.kind).to.equal("district_union");
      expect(region.districtIds).to.deep.equal([EDMONTON_CITY_CENTRE_2019, CALGARY_BUFFALO_2019]);
      expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
      expect(await region.contains(CALGARY_CITY_HALL)).to.equal(true);
      expect(await region.contains(TORONTO)).to.equal(false);
    });

    it('AND requires membership in EVERY child', async () => {
      // ECC ∩ jurisdiction = ECC: the Edmonton point qualifies, the Calgary point does not.
      const region = await reg.resolveRegionRef(
        { op: "and", refs: [`district:${ECC_SLUG}`, "jurisdiction"] },
        { jurisdictionId: JURISDICTION, asOf: BEFORE_REDRAW },
      );
      expect(region.kind).to.equal("composite");
      expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
      expect(await region.contains(CALGARY_CITY_HALL)).to.equal(false);

      // Disjoint districts ⇒ no point is in both.
      const disjoint = await reg.resolveRegionRef(
        { op: "and", refs: [`revision:${EDMONTON_CITY_CENTRE_2019}`, `revision:${CALGARY_BUFFALO_2019}`] },
        { jurisdictionId: JURISDICTION, asOf: BEFORE_REDRAW },
      );
      expect(await disjoint.contains(EDMONTON_LEGISLATURE)).to.equal(false);
      expect(await disjoint.contains(CALGARY_CITY_HALL)).to.equal(false);
    });

    it('NOT is jurisdiction-bounded: not(X) ≡ jurisdiction ∖ X', async () => {
      const region = await reg.resolveRegionRef(
        { op: "not", refs: [`revision:${CALGARY_BUFFALO_2019}`] },
        { jurisdictionId: JURISDICTION, asOf: BEFORE_REDRAW },
      );
      expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true); // in AB, not Calgary-Buffalo
      expect(await region.contains(CALGARY_CITY_HALL)).to.equal(false); // in Calgary-Buffalo
      expect(await region.contains(TORONTO)).to.equal(false); // outside the jurisdiction bound
    });

    it('nests: jurisdiction AND not(Calgary-Buffalo)', async () => {
      const region = await reg.resolveRegionRef(
        { op: "and", refs: ["jurisdiction", { op: "not", refs: [`revision:${CALGARY_BUFFALO_2019}`] }] },
        { jurisdictionId: JURISDICTION, asOf: BEFORE_REDRAW },
      );
      expect(await region.contains(EDMONTON_LEGISLATURE)).to.equal(true);
      expect(await region.contains(CALGARY_CITY_HALL)).to.equal(false);
      expect(await region.contains(TORONTO)).to.equal(false);
    });
  });

  it("rejects a malformed base ref", async () => {
    try {
      await reg.resolveRegionRef("ward:3", { jurisdictionId: JURISDICTION, asOf: BEFORE_REDRAW });
      expect.fail("expected resolveRegionRef to throw on an unknown prefix");
    } catch (e) {
      expect((e as Error).message).to.match(/Invalid RegionRef/);
    }
  });
});
