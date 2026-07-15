// Test harness for @oursay/geo. One shared GeoStore over the dev PostGIS database (the same stack
// public-record uses). Tests ingest the REAL committed Elections Alberta shapefiles and assert
// point-in-polygon against known coordinates, so they exercise the full reproject → store → contains
// path. The known points/ids below were verified against the 2019 Bill-33 boundaries.

import { join } from "node:path";
import { paths, pgConfig } from "../../src/config.js";
import { ShapefileSource } from "../../src/ingest/source.js";
import { RegionResolver } from "../../src/region-resolver.js";
import { GeoStore } from "../../src/store.js";

export const ALBERTA_2019_SHP = join(
  paths.repoRoot,
  "jurisdiction-data",
  "ab-ca-gov",
  "districts",
  "ElectionsAlberta",
  "2019",
  "EDS_ENACTED_BILL33_15DEC2017.shp",
);

/** 2023 voting-area shapefile — ingest dissolves by ED_NUM into 87 ridings. */
export const ALBERTA_2023_VA_SHP = join(
  paths.repoRoot,
  "jurisdiction-data",
  "ab-ca-gov",
  "districts",
  "ElectionsAlberta",
  "2025",
  "EA_Voting_Area_Boundaries_2023.shp",
);

/** Known lon/lat points (EPSG:4326) and the 2019 district revision ids that contain them. */
export const EDMONTON_LEGISLATURE = { lon: -113.5065, lat: 53.5333 }; // → Edmonton-City Centre
export const CALGARY_CITY_HALL = { lon: -114.056, lat: 51.0451 }; // → Calgary-Buffalo
export const TORONTO = { lon: -79.3832, lat: 43.6532 }; // outside Alberta
export const EDMONTON_CITY_CENTRE_2019 = "edmonton-city-centre-2019";
export const CALGARY_BUFFALO_2019 = "calgary-buffalo-2019";
export const EDMONTON_CITY_CENTRE_2023 = "edmonton-city-centre-2023";
export const CALGARY_BUFFALO_2023 = "calgary-buffalo-2023";
export const EDMONTON_CITY_CENTRE_SLUG = "edmonton-city-centre";
export const CALGARY_BUFFALO_SLUG = "calgary-buffalo";
export const JURISDICTION = "ab-ca-gov";
/** After the 2023 provincial election — selects 2023 boundary + seat revisions. */
export const AS_OF_2023 = new Date("2023-06-01");

/** A BoundarySource for the real 2019 Alberta file; overridable for redraw fixtures. */
export function alberta2019Source(overrides: { effectiveDate?: string; boundaryYear?: number } = {}): ShapefileSource {
  return new ShapefileSource({
    sourceId: "test/ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
    jurisdictionId: JURISDICTION,
    effectiveDate: overrides.effectiveDate ?? "2019-04-16",
    drawnDate: "2017-12-15",
    boundaryYear: overrides.boundaryYear ?? 2019,
    srid: 3401, // NAD83 / Alberta 10-TM (Resource), FE=0
    shpPath: ALBERTA_2019_SHP,
    fieldMap: { name: "EDName2017", ref: "EDNumber20" },
  });
}

/**
 * 2023 Elections Alberta voting areas → dissolve by ED_NUM into ridings.
 * Same Bill-33 seats as 2019; must store 87 districts, not ~4.7k VAs.
 */
export function alberta2023Source(): ShapefileSource {
  return new ShapefileSource({
    sourceId: "test/ElectionsAlberta/EA_Voting_Area_Boundaries_2023",
    jurisdictionId: JURISDICTION,
    effectiveDate: "2023-05-29",
    drawnDate: "2017-12-15",
    boundaryYear: 2023,
    srid: 3400, // NAD83 / Alberta 10-TM (Forest), FE=500000
    shpPath: ALBERTA_2023_VA_SHP,
    fieldMap: { name: "ED_NAME", ref: "ED_NUM" },
    dissolveBy: "ED_NUM",
  });
}

let store: GeoStore | undefined;

/** The shared store (PostGIS schema initialized once). */
export async function getStore(): Promise<GeoStore> {
  if (store) return store;
  store = new GeoStore(pgConfig);
  await store.init();
  return store;
}

export function resolver(s: GeoStore): RegionResolver {
  return new RegionResolver({ geoStore: s });
}
