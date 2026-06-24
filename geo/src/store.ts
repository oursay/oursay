// GeoStore — the geo schema's data access, mirroring @oursay/public-record's PrivateStore (idempotent
// init(), guarded reset(), a pg.Pool over the shared PostGIS database). All geometry is stored in
// EPSG:4326; reprojection from a source CRS happens at upsert time via ST_Transform. PostGIS owns
// containment (ST_Contains) and dissolve (ST_Union); this class never folds geometry in JS.

import pg from "pg";
import { assertDestructiveAllowed } from "../../scripts/destructive-guard.js";
import type { PgConfig } from "./config.js";
import { GEO_DDL } from "./schema/geo.sql.js";

/** A point in EPSG:4326 (WGS84). `lon` is X, `lat` is Y. */
export interface LngLat {
  lon: number;
  lat: number;
}

/** One district boundary revision to persist. `geometryGeoJSON` is in the source CRS (`srid`). */
export interface DistrictUpsert {
  id: string;
  jurisdictionId: string;
  name: string;
  ridingSlug: string;
  effectiveDate: string; // ISO DATE
  drawnDate?: string | null; // ISO DATE
  boundaryYear: number;
  source: string;
  sourceRef?: string | null;
  srid: number; // source EPSG of geometryGeoJSON
  geometryGeoJSON: unknown; // GeoJSON Polygon | MultiPolygon (source-CRS coordinates)
}

/** A stored custom/platform region preset. Built-in regions are not persisted. */
export interface RegionRow {
  id: string;
  jurisdictionId: string;
  kind: "district" | "district_union" | "jurisdiction" | "custom";
  name: string;
  districtIds: string[] | null;
  hasGeom: boolean;
}

export class GeoStore {
  readonly pool: pg.Pool;

  constructor(cfg: PgConfig) {
    this.pool = new pg.Pool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      max: 4,
    });
  }

  /** Idempotent: enables PostGIS and creates the geo schema/tables/indexes. */
  async init(): Promise<void> {
    await this.pool.query(GEO_DDL);
  }

  /** Wipe geo rows (test isolation). Guarded: refuses under NODE_ENV=production. */
  async reset(): Promise<void> {
    assertDestructiveAllowed("GeoStore.reset()");
    await this.pool.query("TRUNCATE geo.regions, geo.districts");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ---- ingest ----------------------------------------------------------------

  /** Existing revisions for a (jurisdiction, riding, year) — used to allocate a unique revision id
   *  when a second boundary set lands in the same calendar year. */
  async existingRevisions(
    jurisdictionId: string,
    ridingSlug: string,
    boundaryYear: number,
  ): Promise<{ id: string; effectiveDate: string }[]> {
    const r = await this.pool.query(
      `SELECT id, to_char(effective_date, 'YYYY-MM-DD') AS effective_date
         FROM geo.districts
        WHERE jurisdiction_id = $1 AND riding_slug = $2 AND boundary_year = $3
        ORDER BY effective_date ASC`,
      [jurisdictionId, ridingSlug, boundaryYear],
    );
    return r.rows.map((row) => ({ id: row.id as string, effectiveDate: row.effective_date as string }));
  }

  /** Upsert one district revision. Geometry is reprojected from `srid` to 4326 and normalized to
   *  MultiPolygon. Re-ingesting the same id is a no-op overwrite (idempotent). */
  async upsertDistrict(d: DistrictUpsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO geo.districts
         (id, jurisdiction_id, name, riding_slug, effective_date, drawn_date, boundary_year,
          source, source_ref, geom)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
          ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($10), $11), 4326)))
       ON CONFLICT (id) DO UPDATE SET
          jurisdiction_id = EXCLUDED.jurisdiction_id,
          name            = EXCLUDED.name,
          riding_slug     = EXCLUDED.riding_slug,
          effective_date  = EXCLUDED.effective_date,
          drawn_date      = EXCLUDED.drawn_date,
          boundary_year   = EXCLUDED.boundary_year,
          source          = EXCLUDED.source,
          source_ref      = EXCLUDED.source_ref,
          geom            = EXCLUDED.geom,
          ingested_at     = now()`,
      [
        d.id,
        d.jurisdictionId,
        d.name,
        d.ridingSlug,
        d.effectiveDate,
        d.drawnDate ?? null,
        d.boundaryYear,
        d.source,
        d.sourceRef ?? null,
        JSON.stringify(d.geometryGeoJSON),
        d.srid,
      ],
    );
  }

  // ---- resolution ------------------------------------------------------------

  /** Whether a district revision id exists. */
  async districtExists(id: string): Promise<boolean> {
    const r = await this.pool.query("SELECT 1 FROM geo.districts WHERE id = $1", [id]);
    return r.rowCount! > 0;
  }

  /** The boundary set in effect on `asOf`: one revision per riding (latest effective_date <= asOf).
   *  This is the effective-dated resolution used by `forJurisdiction`. */
  async districtIdsAsOf(jurisdictionId: string, asOf: Date): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT DISTINCT ON (riding_slug) id
         FROM geo.districts
        WHERE jurisdiction_id = $1 AND effective_date <= $2
        ORDER BY riding_slug, effective_date DESC`,
      [jurisdictionId, asOf.toISOString().slice(0, 10)],
    );
    return r.rows.map((row) => row.id as string);
  }

  /** Total district revisions (optionally for one jurisdiction/year) — for tests + ingest smoke. */
  async countDistricts(jurisdictionId?: string, boundaryYear?: number): Promise<number> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (jurisdictionId !== undefined) {
      args.push(jurisdictionId);
      where.push(`jurisdiction_id = $${args.length}`);
    }
    if (boundaryYear !== undefined) {
      args.push(boundaryYear);
      where.push(`boundary_year = $${args.length}`);
    }
    const r = await this.pool.query(
      `SELECT count(*)::int AS n FROM geo.districts ${where.length ? "WHERE " + where.join(" AND ") : ""}`,
      args,
    );
    return r.rows[0].n as number;
  }

  /**
   * Reverse lookup: the district revision whose geometry contains `point`, chosen from the boundary
   * set effective on `asOf` (one revision per riding, latest effective_date <= asOf) — the SAME set
   * `districtIdsAsOf`/`forJurisdiction` resolve, so a reverse lookup always agrees with forward
   * containment. Returns the revision id, or null when the point is outside every riding. Ridings in
   * one effective set do not overlap, so at most one matches (LIMIT 1 for safety).
   */
  async districtContaining(jurisdictionId: string, point: LngLat, asOf: Date): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT eff.id
         FROM (
           SELECT DISTINCT ON (riding_slug) id, geom
             FROM geo.districts
            WHERE jurisdiction_id = $1 AND effective_date <= $2
            ORDER BY riding_slug, effective_date DESC
         ) eff
        WHERE ST_Contains(eff.geom, ST_SetSRID(ST_Point($3, $4), 4326))
        LIMIT 1`,
      [jurisdictionId, asOf.toISOString().slice(0, 10), point.lon, point.lat],
    );
    return r.rows[0]?.id ?? null;
  }

  /** Point-in-polygon over the UNION of the given district revisions. Empty set ⇒ false. */
  async districtsContain(districtIds: string[], point: LngLat): Promise<boolean> {
    if (districtIds.length === 0) return false;
    const r = await this.pool.query(
      `SELECT ST_Contains(
                (SELECT ST_Union(geom) FROM geo.districts WHERE id = ANY($1)),
                ST_SetSRID(ST_Point($2, $3), 4326)
              ) AS hit`,
      [districtIds, point.lon, point.lat],
    );
    return r.rows[0]?.hit === true;
  }

  // ---- custom region presets -------------------------------------------------

  async getRegion(id: string): Promise<RegionRow | null> {
    const r = await this.pool.query(
      `SELECT id, jurisdiction_id, kind, name, district_ids, (geom IS NOT NULL) AS has_geom
         FROM geo.regions WHERE id = $1`,
      [id],
    );
    if (r.rowCount === 0) return null;
    const row = r.rows[0];
    return {
      id: row.id,
      jurisdictionId: row.jurisdiction_id,
      kind: row.kind,
      name: row.name,
      districtIds: row.district_ids ?? null,
      hasGeom: row.has_geom === true,
    };
  }

  /** Point-in-polygon against a stored custom region's own geometry. */
  async customRegionContains(regionId: string, point: LngLat): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT ST_Contains(geom, ST_SetSRID(ST_Point($2, $3), 4326)) AS hit
         FROM geo.regions WHERE id = $1`,
      [regionId, point.lon, point.lat],
    );
    return r.rows[0]?.hit === true;
  }
}
