// Public, unauthenticated AREA CATALOG (docs/01 §7.2; closes [mvp-c6-area-catalog]). A thin read
// surface over @oursay/geo's GeoStore + the registered jurisdiction configs: a jurisdiction index,
// an effective-dated district directory at an instant, and the official GeoJSON geometry for a
// district revision. NO private data — never user geocode points, addresses, geo.regions presets,
// or sub-riding tiles; only official ingested electoral boundaries (docs/06 §2–3).

import type { DistrictCatalogRow, GeoStore } from "@oursay/geo";
import type { JurisdictionConfig } from "@oursay/public-record";
import { ServiceError } from "../errors.js";

/** A jurisdiction as exposed publicly: id + level + optional display label. No rules/privacy/counts. */
export interface JurisdictionSummary {
  id: string;
  level: string;
  label?: string;
}

export interface DistrictListItem extends DistrictCatalogRow {
  geometry?: unknown; // present only when include=geometry
}

export interface DistrictDirectory {
  jurisdictionId: string;
  asOf: string; // the resolved UTC calendar date (YYYY-MM-DD)
  items: DistrictListItem[];
}

/** UTC calendar date (YYYY-MM-DD) for a Date — matches GeoStore's `asOf.toISOString().slice(0, 10)`,
 *  so the catalog's default instant is an explicit UTC date, not server-local midnight. */
function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ASOF_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AreaCatalogService {
  private readonly geoStore: GeoStore;
  private readonly jurisdictions: JurisdictionConfig[];

  constructor(deps: { geoStore: GeoStore; jurisdictions: JurisdictionConfig[] }) {
    this.geoStore = deps.geoStore;
    this.jurisdictions = deps.jurisdictions;
  }

  /** The registered jurisdiction index — id + level + optional public label only. */
  listJurisdictions(): JurisdictionSummary[] {
    return this.jurisdictions.map((j) => ({
      id: j.id,
      level: j.level,
      ...(j.label !== undefined ? { label: j.label } : {}),
    }));
  }

  /** The effective-dated district directory for a jurisdiction at `asOf` (default: today UTC). One
   *  revision per riding (latest effective_date <= asOf). A registered jurisdiction with no ingested
   *  boundaries yields an empty list (200). Unknown jurisdiction ⇒ 404. */
  async listDistricts(
    jurisdictionId: string,
    opts: { asOf?: string; includeGeometry?: boolean } = {},
  ): Promise<DistrictDirectory> {
    this.requireJurisdiction(jurisdictionId);
    const asOf = this.resolveAsOf(opts.asOf);
    const items = await this.geoStore.listDistrictsAsOf(jurisdictionId, new Date(`${asOf}T00:00:00Z`), {
      includeGeometry: opts.includeGeometry,
    });
    return { jurisdictionId, asOf, items };
  }

  /** Official GeoJSON (4326 MultiPolygon) for ONE district revision by id. Any ingested revision is
   *  fetchable, including superseded redraws (audit). 404 when the jurisdiction is unknown, the
   *  revision is unknown, or the revision belongs to a different jurisdiction. */
  async getDistrictGeometry(jurisdictionId: string, revisionId: string): Promise<unknown> {
    this.requireJurisdiction(jurisdictionId);
    const owner = await this.geoStore.districtJurisdiction(revisionId);
    if (owner !== jurisdictionId) {
      throw new ServiceError("not_found", `district revision not found: ${revisionId}`);
    }
    const geometry = await this.geoStore.getDistrictGeometry(revisionId);
    if (geometry == null) {
      throw new ServiceError("not_found", `district revision not found: ${revisionId}`);
    }
    return geometry;
  }

  private requireJurisdiction(id: string): void {
    if (!this.jurisdictions.some((j) => j.id === id)) {
      throw new ServiceError("not_found", `unknown jurisdiction: ${id}`);
    }
  }

  private resolveAsOf(asOf?: string): string {
    if (asOf === undefined) return utcDateString(new Date());
    if (!ASOF_RE.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
      throw new ServiceError("validation", `asOf must be a UTC calendar date (YYYY-MM-DD): ${asOf}`);
    }
    return asOf;
  }
}
