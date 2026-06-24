// Pluggable boundary ingest. A BoundarySource yields CRS-native district geometries + the metadata
// needed to date and identify each revision; `ingestBoundaries` reprojects (in PostGIS) and upserts
// them into geo.districts, allocating a stable revision id. ShapefileSource is the first concrete
// source (Elections Alberta .shp/.dbf); new formats (GeoJSON, other commissions) implement the same
// interface without touching the Region API or the resolver.

import { open } from "shapefile";
import type { Feature, Geometry, MultiPolygon, Polygon } from "geojson";
import type { DistrictUpsert, GeoStore } from "../store.js";

/** One district's CRS-native geometry + the source's identity fields. */
export interface RawDistrict {
  name: string;
  sourceRef: string;
  /** GeoJSON Polygon | MultiPolygon, coordinates in the source CRS (`BoundarySource.srid`). */
  geometryGeoJSON: Polygon | MultiPolygon;
}

/** A pluggable boundary provider. `effectiveDate` is REQUIRED — it is the lookup key for which
 *  geometry applies at instant T. `boundaryYear` is slug/display only. */
export interface BoundarySource {
  readonly sourceId: string; // provenance label (file + authority)
  readonly jurisdictionId: string; // e.g. "ab-ca-gov"
  readonly effectiveDate: string; // ISO DATE — when this set comes into force
  readonly drawnDate?: string; // ISO DATE — enactment/draw date, if known
  readonly boundaryYear: number; // slug/display only
  readonly srid: number; // source EPSG (reprojected to 4326 on ingest)
  read(): AsyncIterable<RawDistrict>;
}

export interface IngestResult {
  jurisdictionId: string;
  boundaryYear: number;
  effectiveDate: string;
  count: number;
}

/** Slug a district name into a year-less logical-riding key: strip diacritics, lowercase, collapse
 *  non-alphanumerics to single dashes. "Lac Ste. Anne-Parkland" → "lac-ste-anne-parkland". */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g"); // accents after NFD decomposition
export function ridingSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ingest every district from a source. For each, computes the riding slug, allocates a stable revision
 * id (`{slug}-{year}`, with a `-{n}` suffix when a different boundary set already exists for the same
 * riding+year), and upserts (reproject + normalize to MultiPolygon happen in PostGIS). Re-ingesting the
 * same set (same effective_date) reuses the same id → idempotent overwrite.
 */
export async function ingestBoundaries(store: GeoStore, source: BoundarySource): Promise<IngestResult> {
  let count = 0;
  for await (const raw of source.read()) {
    const slug = ridingSlug(raw.name);
    const id = await allocateRevisionId(store, source, slug);
    const upsert: DistrictUpsert = {
      id,
      jurisdictionId: source.jurisdictionId,
      name: raw.name,
      ridingSlug: slug,
      effectiveDate: source.effectiveDate,
      drawnDate: source.drawnDate ?? null,
      boundaryYear: source.boundaryYear,
      source: source.sourceId,
      sourceRef: raw.sourceRef,
      srid: source.srid,
      geometryGeoJSON: raw.geometryGeoJSON,
    };
    await store.upsertDistrict(upsert);
    count++;
  }
  return {
    jurisdictionId: source.jurisdictionId,
    boundaryYear: source.boundaryYear,
    effectiveDate: source.effectiveDate,
    count,
  };
}

/** Pick the revision id for this riding+year+effectiveDate: reuse the existing id for the same
 *  effective_date (idempotent re-ingest), else the next free `{slug}-{year}[-n]`. */
async function allocateRevisionId(store: GeoStore, source: BoundarySource, slug: string): Promise<string> {
  const existing = await store.existingRevisions(source.jurisdictionId, slug, source.boundaryYear);
  const sameDate = existing.find((e) => e.effectiveDate === source.effectiveDate);
  if (sameDate) return sameDate.id; // same revision → overwrite in place

  const base = `${slug}-${source.boundaryYear}`;
  const taken = new Set(existing.map((e) => e.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Map a shapefile's DBF columns onto our name/ref fields. */
export interface ShapefileFieldMap {
  name: string; // DBF column for the district display name (e.g. "EDName2017", "ED_NAME")
  ref: string; // DBF column for the source id (e.g. "EDNumber20", "ED_NUM")
}

export interface ShapefileSourceOptions {
  sourceId: string;
  jurisdictionId: string;
  effectiveDate: string;
  drawnDate?: string;
  boundaryYear: number;
  srid: number;
  /** Path to the .shp; the sibling .dbf is derived (same basename). */
  shpPath: string;
  fieldMap: ShapefileFieldMap;
  /** Optional DBF encoding (default utf-8). */
  encoding?: string;
  /** When set, features are GROUPED by this DBF column and each group is emitted as one district
   *  (a MultiPolygon of the group's polygons) — e.g. dissolve voting areas (`ED_NUM`) into ridings.
   *  Containment over the combined MultiPolygon equals containment over the dissolved district. */
  dissolveBy?: string;
}

/** A BoundarySource backed by an ESRI shapefile (.shp + .dbf), read via the pure-JS `shapefile` lib. */
export class ShapefileSource implements BoundarySource {
  readonly sourceId: string;
  readonly jurisdictionId: string;
  readonly effectiveDate: string;
  readonly drawnDate?: string;
  readonly boundaryYear: number;
  readonly srid: number;

  constructor(private readonly opts: ShapefileSourceOptions) {
    this.sourceId = opts.sourceId;
    this.jurisdictionId = opts.jurisdictionId;
    this.effectiveDate = opts.effectiveDate;
    this.drawnDate = opts.drawnDate;
    this.boundaryYear = opts.boundaryYear;
    this.srid = opts.srid;
  }

  async *read(): AsyncIterable<RawDistrict> {
    const dbfPath = this.opts.shpPath.replace(/\.shp$/i, ".dbf");
    const src = await open(this.opts.shpPath, dbfPath, { encoding: this.opts.encoding ?? "utf-8" });

    if (!this.opts.dissolveBy) {
      for (let res = await src.read(); !res.done; res = await src.read()) {
        const f = res.value as Feature;
        const geom = asPolygonal(f.geometry);
        if (!geom) continue;
        yield {
          name: String(f.properties?.[this.opts.fieldMap.name] ?? "").trim(),
          sourceRef: String(f.properties?.[this.opts.fieldMap.ref] ?? "").trim(),
          geometryGeoJSON: geom,
        };
      }
      return;
    }

    // Dissolve path: accumulate polygons per group key, then emit one MultiPolygon per group.
    const groups = new Map<string, { name: string; ref: string; polygons: Polygon["coordinates"][] }>();
    for (let res = await src.read(); !res.done; res = await src.read()) {
      const f = res.value as Feature;
      const key = String(f.properties?.[this.opts.dissolveBy] ?? "").trim();
      if (!key) continue;
      const geom = asPolygonal(f.geometry);
      if (!geom) continue;
      const g = groups.get(key) ?? {
        name: String(f.properties?.[this.opts.fieldMap.name] ?? "").trim(),
        ref: key,
        polygons: [],
      };
      if (geom.type === "Polygon") g.polygons.push(geom.coordinates);
      else for (const poly of geom.coordinates) g.polygons.push(poly);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      yield {
        name: g.name,
        sourceRef: g.ref,
        geometryGeoJSON: { type: "MultiPolygon", coordinates: g.polygons },
      };
    }
  }
}

/** Narrow a GeoJSON geometry to Polygon | MultiPolygon (the only kinds districts carry). */
function asPolygonal(geom: Geometry | null): Polygon | MultiPolygon | null {
  if (!geom) return null;
  if (geom.type === "Polygon" || geom.type === "MultiPolygon") return geom;
  return null;
}
