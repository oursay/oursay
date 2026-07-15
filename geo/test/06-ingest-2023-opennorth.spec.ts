// 2023 voting-area shapefile must dissolve to 87 ridings (not ~4.7k polling areas),
// known pins must resolve via ST_Contains, and OpenNorth MLA seats must attach by district_slug.

import { expect } from "chai";
import { join } from "node:path";
import { paths } from "../src/config.js";
import { ingestOfficialSeats } from "../src/ingest/official-seats.js";
import { ingestBoundaries } from "../src/ingest/source.js";
import type { RegionResolver } from "../src/region-resolver.js";
import type { GeoStore } from "../src/store.js";
import {
  AS_OF_2023,
  CALGARY_BUFFALO_2023,
  CALGARY_BUFFALO_SLUG,
  CALGARY_CITY_HALL,
  EDMONTON_CITY_CENTRE_2023,
  EDMONTON_CITY_CENTRE_SLUG,
  EDMONTON_LEGISLATURE,
  JURISDICTION,
  TORONTO,
  alberta2023Source,
  getStore,
  resolver,
} from "./helpers/world.js";

describe("06 geo: 2023 dissolve ingest + OpenNorth seats + known pins", () => {
  let store: GeoStore;
  let reg: RegionResolver;
  let districtSlugs: Set<string>;

  before(async function () {
    this.timeout(180_000); // dissolve of 4.7k VAs is slow
    store = await getStore();
    await store.reset();

    const boundaries = await ingestBoundaries(store, alberta2023Source());
    expect(boundaries.count).to.equal(87);
    expect(boundaries.boundaryYear).to.equal(2023);

    const seats = await ingestOfficialSeats(
      store,
      {
        jurisdictionId: JURISDICTION,
        effectiveDate: "2023-05-29",
        boundaryYear: 2023,
        catalogPath: join(
          paths.repoRoot,
          "jurisdiction-data",
          "ab-ca-gov",
          "leaders",
          "opennorth",
          "normalized",
          "seats.json",
        ),
      },
      paths.repoRoot,
    );
    expect(seats.count).to.be.at.least(87);

    reg = resolver(store);
    const catalog = await store.listDistrictsAsOf(JURISDICTION, AS_OF_2023);
    districtSlugs = new Set(catalog.map((d) => d.districtSlug));
  });

  it("stores 87 ridings (dissolved), not thousands of voting areas", async () => {
    expect(await store.countDistricts(JURISDICTION)).to.equal(87);
    const catalog = await store.listDistrictsAsOf(JURISDICTION, AS_OF_2023);
    expect(catalog).to.have.length(87);
    // source_ref is ED_NUM after dissolve (small integers), never VA-scale ids.
    for (const d of catalog) {
      expect(d.id.endsWith("-2023"), d.id).to.equal(true);
      expect(d.sourceRef, d.id).to.match(/^\d{1,3}$/);
    }
  });

  it("known pins resolve to year-less riding slugs via districtSlugContaining", async () => {
    expect(await store.districtSlugContaining(JURISDICTION, EDMONTON_LEGISLATURE, AS_OF_2023)).to.equal(
      EDMONTON_CITY_CENTRE_SLUG,
    );
    expect(await store.districtSlugContaining(JURISDICTION, CALGARY_CITY_HALL, AS_OF_2023)).to.equal(
      CALGARY_BUFFALO_SLUG,
    );
    expect(await store.districtSlugContaining(JURISDICTION, TORONTO, AS_OF_2023)).to.equal(null);
  });

  it("known pins hit 2023 revision ids via districtContaining + Region.contains", async () => {
    expect(await store.districtContaining(JURISDICTION, EDMONTON_LEGISLATURE, AS_OF_2023)).to.equal(
      EDMONTON_CITY_CENTRE_2023,
    );
    expect(await store.districtContaining(JURISDICTION, CALGARY_CITY_HALL, AS_OF_2023)).to.equal(
      CALGARY_BUFFALO_2023,
    );

    const edmonton = await reg.resolve(EDMONTON_CITY_CENTRE_2023);
    expect(await edmonton.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await edmonton.contains(CALGARY_CITY_HALL)).to.equal(false);

    const calgary = await reg.resolve(CALGARY_BUFFALO_2023);
    expect(await calgary.contains(CALGARY_CITY_HALL)).to.equal(true);
    expect(await calgary.contains(EDMONTON_LEGISLATURE)).to.equal(false);

    const alberta = await reg.forJurisdiction(JURISDICTION, AS_OF_2023);
    expect(alberta.districtIds).to.have.length(87);
    expect(await alberta.contains(EDMONTON_LEGISLATURE)).to.equal(true);
    expect(await alberta.contains(CALGARY_CITY_HALL)).to.equal(true);
    expect(await alberta.contains(TORONTO)).to.equal(false);
  });

  it("OpenNorth roster seats attach to ingested 2023 riding slugs", async () => {
    const seats = await store.listOfficialSeatsAsOf(JURISDICTION, AS_OF_2023);
    expect(seats.length).to.be.at.least(87);

    const mlas = seats.filter((s) => s.seatKind === "district_mla");
    expect(mlas).to.have.length(87);
    expect(mlas.every((s) => s.boundaryYear === 2023)).to.equal(true);
    expect(mlas.every((s) => s.source === "opennorth")).to.equal(true);

    const missing: string[] = [];
    for (const seat of mlas) {
      expect(seat.districtSlug, seat.seatHandle).to.be.a("string");
      if (!seat.districtSlug || !districtSlugs.has(seat.districtSlug)) {
        missing.push(`${seat.seatHandle} → ${seat.districtSlug}`);
      }
    }
    expect(missing, `MLA district_slug orphans:\n${missing.join("\n")}`).to.deep.equal([]);

    const edmSeat = await store.getOfficialSeatForDistrict(
      JURISDICTION,
      EDMONTON_CITY_CENTRE_SLUG,
      AS_OF_2023,
    );
    expect(edmSeat, "Edmonton-City Centre MLA").to.not.equal(null);
    expect(edmSeat!.id).to.equal(`${edmSeat!.seatHandle}-2023`);
    expect(edmSeat!.districtSlug).to.equal(EDMONTON_CITY_CENTRE_SLUG);

    const calSeat = await store.getOfficialSeatForDistrict(
      JURISDICTION,
      "calgary-bhullar-mccall",
      AS_OF_2023,
    );
    expect(calSeat, "Calgary-Bhullar-McCall MLA (OpenNorth Calgary-McCall alias)").to.not.equal(null);
    expect(calSeat!.districtSlug).to.equal("calgary-bhullar-mccall");

    const buffaloSeat = await store.getOfficialSeatForDistrict(
      JURISDICTION,
      CALGARY_BUFFALO_SLUG,
      AS_OF_2023,
    );
    expect(buffaloSeat, "Calgary-Buffalo MLA").to.not.equal(null);
    expect(buffaloSeat!.districtSlug).to.equal(CALGARY_BUFFALO_SLUG);

    const leaders = seats.filter((s) => s.seatKind === "jurisdiction_leader");
    expect(leaders.length).to.be.at.least(1);
  });

  it("re-ingesting the 2023 set is idempotent (still 87 districts)", async function () {
    this.timeout(180_000);
    await ingestBoundaries(store, alberta2023Source());
    expect(await store.countDistricts(JURISDICTION)).to.equal(87);
  });
});
