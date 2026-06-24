// DDL for the `geo` schema: PostGIS-backed electoral district boundaries + the Region registry.
//
// Boundary DATING is the heart of this schema. A district id is the stable identity of a boundary
// REVISION (year-anchored slug, with a `-{n}` suffix if a second set lands the same calendar year),
// but the authority for "which geometry applies at instant T" is `effective_date` — NOT the year.
// `boundary_year` is retained for slugging/display only. `riding_slug` is the year-less logical-riding
// key that groups revisions of the same seat across redraws, so `asOf` resolution can pick one
// revision per riding (latest effective_date <= asOf).
//
// All geometry is stored in EPSG:4326 (WGS84 lon/lat). Source shapefiles are reprojected on ingest
// (ST_Transform) from their native CRS; PostGIS owns containment (ST_Contains) and dissolve (ST_Union).

export const GEO_DDL = `
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS geo;

-- One row per district boundary REVISION. The same seat redrawn over time yields multiple rows that
-- share a riding_slug but differ by effective_date.
CREATE TABLE IF NOT EXISTS geo.districts (
  id              TEXT PRIMARY KEY,                       -- stable revision id, e.g. "edmonton-strathcona-2019" (or "...-2019-2")
  jurisdiction_id TEXT NOT NULL,                          -- e.g. "ab-ca-gov"
  name            TEXT NOT NULL,                          -- display name, e.g. "Edmonton-Strathcona"
  riding_slug     TEXT NOT NULL,                          -- year-less logical-riding key (groups revisions)
  effective_date  DATE NOT NULL,                          -- first day this geometry is in force (the LOOKUP key)
  drawn_date      DATE,                                   -- when the map was drawn/enacted, if known (e.g. Bill-33)
  boundary_year   INT  NOT NULL,                          -- slug/display only; derived from effective_date
  source          TEXT NOT NULL,                          -- provenance (file + authority)
  source_ref      TEXT,                                   -- original source id (EDNumber20 / ED_NUM)
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom            geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS districts_geom_gix    ON geo.districts USING GIST (geom);
CREATE INDEX IF NOT EXISTS districts_jur_eff_idx ON geo.districts (jurisdiction_id, effective_date);
CREATE INDEX IF NOT EXISTS districts_lineage_idx ON geo.districts (jurisdiction_id, riding_slug, effective_date);

-- The Region registry persists ONLY custom/platform presets. Built-in regions (a single district,
-- a district union, a whole-jurisdiction extent) are computed on the fly by the RegionResolver and
-- need no rows. A region is defined by explicit district_ids[] (each an effective-dated revision —
-- so the asOf selection already happened when those ids were chosen) or its own custom geom.
CREATE TABLE IF NOT EXISTS geo.regions (
  id              TEXT PRIMARY KEY,
  jurisdiction_id TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('district','district_union','jurisdiction','custom')),
  name            TEXT NOT NULL,
  district_ids    TEXT[],                                 -- explicit revision ids that already imply the set
  geom            geometry(MultiPolygon, 4326),           -- only for 'custom' presets
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS regions_geom_gix ON geo.regions USING GIST (geom);
`;
