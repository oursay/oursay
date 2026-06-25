# @oursay/geo

Geographic foundation for OurSay: **PostGIS-backed electoral district boundaries**, a first-class
**Region** model, **pluggable boundary ingest**, and an effective-dated **RegionResolver**. Consumed by `@oursay/api` via `RegionResolver` and `ParticipantGeoService`. Public count filtering
(`GET /v1/public/…/:id/counts`) compiles `GeoScope` → `Region` here; list/detail routes do not filter.

See [`docs/REGION-MODEL.md`](../docs/REGION-MODEL.md) for the model and [`docs/GLOSSARY.md`](../docs/GLOSSARY.md)
for the canonical vocabulary (jurisdiction → district → region).

## Vocabulary

- **District** — an atomic electoral boundary (riding/ward). One row per **revision** in `geo.districts`.
- **Region** — any filterable shape. Kinds: single **district**, **district union**, whole
  **jurisdiction** extent, or a stored **custom** geometry. Filter code calls `region.contains(point)`;
  it never branches on raw district-id lists. **Every district is a region; not every region is a district.**

## Effective-dated boundaries

A district `id` is a stable revision identity with a **year label** — but the year is *not* the lookup
key. Each revision carries:

- `effective_date` (**required**) — first day this geometry is in force; the key `asOf` resolution uses.
- `drawn_date` (optional) — enactment/draw date if known (Alberta Bill-33 ≈ `2017-12-15`).
- `boundary_year` — slug/display only; `riding_slug` — year-less key grouping revisions of a seat.

**ID scheme:** `{riding-slug}-{boundary-year}`, e.g. `edmonton-strathcona-2019`. If a second boundary
set lands the same calendar year, the id gets a monotonic suffix: `edmonton-strathcona-2019-2`.

**`asOf` resolution:** `forJurisdiction(jur, asOf)` returns one revision per riding — the latest
`effective_date <= asOf`. A redraw is just a later-dated revision; queries before/after it resolve to
the older/newer geometry automatically.

## Ingest

Boundaries load from a pluggable `BoundarySource`. `ShapefileSource` reads ESRI `.shp/.dbf` (pure-JS
`shapefile`), maps DBF columns via a `fieldMap`, and — with an optional `dissolveBy` — groups finer
features (e.g. voting areas) into ridings. Geometry is reprojected from the source EPSG to 4326 **in
PostGIS** (`ST_Transform`); no `proj4`/native build.

```bash
# Start the shared PostGIS stack (owned by public-record). First switch to the PostGIS image needs a
# one-time recreate; the data volume is reused (same PG 16 major).
npm run db:up -w @oursay/public-record

npm run -w @oursay/geo ingest                 # primary: 2019 Bill-33 districts (87 ridings)
npm run -w @oursay/geo ingest -- 2023         # secondary: dissolve 2023 voting areas → ridings
npm run -w @oursay/geo ingest -- 2019 --reset # wipe geo tables first (guarded; refuses in production)
```

Ingest is an **idempotent upsert**: re-running the same set (same `effective_date`) overwrites in place.

### Alberta source data & CRS

Committed under `jurisdiction-data/ab-ca-gov/districts/ElectionsAlberta/`:

| Set | File | Features | Native CRS | Notes |
|---|---|---|---|---|
| **2019** (primary) | `2019/EDS_ENACTED_BILL33_15DEC2017.shp` | 87 districts | EPSG:**3401** (NAD83 10-TM Resource, FE=0) | `fieldMap {name: EDName2017, ref: EDNumber20}` |
| 2023 (secondary) | `2025/EA_Voting_Area_Boundaries_2023.shp` | 4,765 voting areas | EPSG:**3400** (NAD83 10-TM Forest, FE=500000) | `dissolveBy: ED_NUM` |

## API

```ts
import { GeoStore, RegionResolver, ShapefileSource, ingestBoundaries } from "@oursay/geo";

const store = new GeoStore(pgConfig);
await store.init();                                  // idempotent: CREATE EXTENSION postgis + geo schema

const reg = new RegionResolver({ geoStore: store });
const ab = await reg.forJurisdiction("ab-ca-gov", new Date("2020-01-01"));
await ab.contains({ lon: -113.5065, lat: 53.5333 }); // true (Edmonton Legislature)

// Reverse lookup: which effective-dated riding revision contains a point? (null when outside all).
await store.districtContaining("ab-ca-gov", { lon: -113.5065, lat: 53.5333 }, new Date("2020-01-01"));
// → "edmonton-city-centre-2019"

// Coarse scope → Region (same seam the public read count filter uses):
const region = await reg.compileScope({ scope: "impacted-region", jurisdictionId: "ab-ca-gov",
  appliesToDistrictIds: ["edmonton-strathcona-2019"] });
```

## Tests

```bash
npm test -w @oursay/geo        # ingests the real shapefiles; asserts contains() over known coordinates
npm run -w @oursay/geo typecheck
```

Tests need the PostGIS stack up. They reproject and load the committed 2019 file (no fixtures), then
assert known Edmonton/Calgary points fall inside their ridings and points outside Alberta do not, across
the district / union / jurisdiction / custom kinds and the effective-dated redraw path.

## Notes / out of scope

- Containment is DB-backed (PostGIS is authoritative). The whole-jurisdiction extent unions 87
  geometries per query; an in-memory/materialized-union cache is a future optimization.
- `districtContaining(jurisdictionId, point, asOf)` is the reverse of `Region.contains`: it returns the
  one effective-dated riding revision (or null) containing a point. `@oursay/api`'s `ParticipantGeoService`
  consumes it to map a participant's private point to a district revision; this package still owns the
  PostGIS, not the participant linkage.
- No public-filter activation, no district stored on the user row, no exposure of arbitrary geometry on
  unauthenticated routes — all follow-on work. (Address→point geocoding lives in `@oursay/api`
  (`auth.profile_geocodes`); this package owns boundaries + `Region.contains`, not participant points.)
