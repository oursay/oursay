// DDL for the `geo` schema: PostGIS-backed electoral district boundaries + the Region registry.
//
// Boundary DATING is the heart of this schema. A district id is the stable identity of a boundary
// REVISION (year-anchored slug, with a `-{n}` suffix if a second set lands the same calendar year),
// but the authority for "which geometry applies at instant T" is `effective_date` — NOT the year.
// `boundary_year` is retained for slugging/display only. `district_slug` is the year-less logical-seat
// key that groups revisions of the same seat across redraws, so `asOf` resolution can pick one
// revision per seat (latest effective_date <= asOf).
//
// All geometry is stored in EPSG:4326 (WGS84 lon/lat). Source shapefiles are reprojected on ingest
// (ST_Transform) from their native CRS; PostGIS owns containment (ST_Contains) and dissolve (ST_Union).

export const GEO_DDL = `
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS geo;

-- One row per district boundary REVISION. The same seat redrawn over time yields multiple rows that
-- share a district_slug but differ by effective_date.
CREATE TABLE IF NOT EXISTS geo.districts (
  id              TEXT PRIMARY KEY,                       -- stable revision id, e.g. "edmonton-strathcona-2019" (or "...-2019-2")
  jurisdiction_id TEXT NOT NULL,                          -- e.g. "ab-ca-gov"
  name            TEXT NOT NULL,                          -- display name, e.g. "Edmonton-Strathcona"
  district_slug   TEXT NOT NULL,                          -- year-less logical-seat key (groups revisions)
  effective_date  DATE NOT NULL,                          -- first day this geometry is in force (the LOOKUP key)
  drawn_date      DATE,                                   -- when the map was drawn/enacted, if known (e.g. Bill-33)
  boundary_year   INT  NOT NULL,                          -- slug/display only; derived from effective_date
  source          TEXT NOT NULL,                          -- provenance (file + authority)
  source_ref      TEXT,                                   -- original source id (EDNumber20 / ED_NUM)
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom            geometry(MultiPolygon, 4326) NOT NULL,
  source_entity_id UUID,
  source_tx_id     UUID,
  source_tx_hash   TEXT,
  geometry_sha256  TEXT
);
ALTER TABLE geo.districts ADD COLUMN IF NOT EXISTS source_entity_id UUID;
ALTER TABLE geo.districts ADD COLUMN IF NOT EXISTS source_tx_id UUID;
ALTER TABLE geo.districts ADD COLUMN IF NOT EXISTS source_tx_hash TEXT;
ALTER TABLE geo.districts ADD COLUMN IF NOT EXISTS geometry_sha256 TEXT;
CREATE INDEX IF NOT EXISTS districts_geom_gix    ON geo.districts USING GIST (geom);
CREATE INDEX IF NOT EXISTS districts_jur_eff_idx ON geo.districts (jurisdiction_id, effective_date);
CREATE INDEX IF NOT EXISTS districts_lineage_idx ON geo.districts (jurisdiction_id, district_slug, effective_date);

-- Official seat roster: one row per seat revision, aligned to a boundary effective_date.
-- Seat handles (ab-premier, ab-edm_strth) are stable; id is year/redraw-scoped like districts.
CREATE TABLE IF NOT EXISTS geo.official_seats (
  id                    TEXT PRIMARY KEY,                       -- e.g. "ab-edm_strth-2019"
  jurisdiction_id       TEXT NOT NULL,
  seat_kind             TEXT NOT NULL CHECK (seat_kind IN ('jurisdiction_leader', 'district_mla')),
  title                 TEXT NOT NULL,                          -- e.g. "Alberta Premier", "District MLA"
  seat_handle           TEXT NOT NULL,                          -- stable handle, e.g. "ab-edm_strth"
  district_slug         TEXT,                                   -- year-less riding key (MLA seats)
  district_short_slug   TEXT,
  leader_role           TEXT,                                   -- premier | platform (jurisdiction leaders)
  effective_date        DATE NOT NULL,
  boundary_year         INT  NOT NULL,
  role                  TEXT NOT NULL,                          -- display line, e.g. "MLA · Edmonton-Strathcona"
  representative_name   TEXT NOT NULL,
  claimed_user_handle   TEXT,                                   -- platform-linked user profile when claimed
  source                TEXT NOT NULL,
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_entity_id      UUID,
  source_tx_id          UUID,
  source_tx_hash        TEXT
);
ALTER TABLE geo.official_seats ADD COLUMN IF NOT EXISTS source_entity_id UUID;
ALTER TABLE geo.official_seats ADD COLUMN IF NOT EXISTS source_tx_id UUID;
ALTER TABLE geo.official_seats ADD COLUMN IF NOT EXISTS source_tx_hash TEXT;
CREATE INDEX IF NOT EXISTS official_seats_jur_eff_idx
  ON geo.official_seats (jurisdiction_id, effective_date);
CREATE INDEX IF NOT EXISTS official_seats_handle_idx
  ON geo.official_seats (seat_handle, effective_date);
CREATE INDEX IF NOT EXISTS official_seats_district_idx
  ON geo.official_seats (jurisdiction_id, district_slug, effective_date);

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
