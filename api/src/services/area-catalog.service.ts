// Public, unauthenticated AREA CATALOG (docs/01 §7.2; closes [mvp-c6-area-catalog]). A thin read
// surface over @oursay/geo's GeoStore + the registered jurisdiction configs: a jurisdiction index,
// an effective-dated district directory at an instant, and the official GeoJSON geometry for a
// district revision. NO private data — never user geocode points, addresses, geo.regions presets,
// or sub-riding tiles; only official ingested electoral boundaries (docs/06 §2–3).

import type { DistrictCatalogRow, GeoStore } from "@oursay/geo";
import {
  allOfficialSeats,
  type OfficialSeatRecord,
} from "@oursay/jurisdiction-data";
import type {
  JurisdictionConfig,
  JurisdictionContentLimits,
  JurisdictionGates,
  JurisdictionLabels,
} from "@oursay/public-record";
import { DEFAULT_GATES, getJurisdiction as getRegisteredJurisdiction } from "@oursay/public-record";
import { ServiceError } from "../errors.js";

/** A jurisdiction as exposed publicly: id + level + optional display label, per-record-type labels,
 *  content caps, and Media recognition body ids. No rules/privacy/counts (those stay platform-internal). */
export interface JurisdictionSummary {
  id: string;
  level: string;
  label?: string;
  labels?: JurisdictionLabels;
  contentLimits?: JurisdictionContentLimits;
  /** Platform-catalog accreditation-body ids on OurSay’s recognition list for this jurisdiction. */
  recognizedAccreditationBodyIds?: string[];
}

export interface DistrictListItem extends DistrictCatalogRow {
  geometry?: unknown; // present only when include=geometry
  /** MLA name from public record, when roster is ingested. */
  leader?: string;
  /** Official seat handle for the district MLA (links to /official/{handle}). */
  leaderHandle?: string;
  seatHandle?: string;
  /** User handle when the seat is claimed (avatar seed + profile link). */
  claimedUserHandle?: string | null;
  leaderClaimed?: boolean;
}

export interface DistrictDirectory {
  jurisdictionId: string;
  asOf: string; // the resolved UTC calendar date (YYYY-MM-DD)
  items: DistrictListItem[];
}

/** Public jurisdiction detail (P7): config fields the jurisdiction view needs — no privacy/counts/rules. */
export interface JurisdictionDetail {
  id: string;
  level: string;
  label?: string;
  labels?: JurisdictionLabels;
  gates: JurisdictionGates;
  graduationThreshold: number | null;
  /** Platform-catalog accreditation-body ids on OurSay’s recognition list for this jurisdiction. */
  recognizedAccreditationBodyIds?: string[];
  leader?: {
    name: string;
    handle: string;
    claimed?: boolean;
    claimedUserHandle?: string | null;
    leaderRole?: string;
  };
  rulesCopy?: string[];
}

/** Public district detail by stable slug (P8). Leader/about have no backend source yet. */
export interface DistrictDetail {
  name: string;
  slug: string;
  jur: string;
  boundaryYear: number | null;
  effectiveDate: string;
  sourceName?: string;
  leader: string | null;
  leaderHandle: string | null;
  claimedUserHandle?: string | null;
  leaderClaimed?: boolean;
  about: string | null;
}

/** UTC calendar date (YYYY-MM-DD) for a Date — matches GeoStore's `asOf.toISOString().slice(0, 10)`,
 *  so the catalog's default instant is an explicit UTC date, not server-local midnight. */
function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ASOF_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AreaCatalogService {
  private readonly geoStore: GeoStore;
  private readonly jurisdictionIds: string[];
  private readonly seatsByJurisdiction: Map<string, OfficialSeatRecord[]>;

  constructor(deps: {
    geoStore: GeoStore;
    jurisdictions: JurisdictionConfig[];
    officialSeats?: OfficialSeatRecord[];
  }) {
    this.geoStore = deps.geoStore;
    this.jurisdictionIds = deps.jurisdictions.map((j) => j.id);
    this.seatsByJurisdiction = new Map();
    for (const seat of deps.officialSeats ?? allOfficialSeats()) {
      const list = this.seatsByJurisdiction.get(seat.jurisdictionId) ?? [];
      list.push(seat);
      this.seatsByJurisdiction.set(seat.jurisdictionId, list);
    }
  }

  /** Public jurisdiction detail (P7). Unknown id ⇒ 404. */
  async getJurisdiction(jurisdictionId: string): Promise<JurisdictionDetail> {
    const j = this.requireJurisdictionConfig(jurisdictionId);
    let leader = j.leader;
    if (leader?.handle) {
      const dbSeat = await this.geoStore.getOfficialSeatByHandle(leader.handle);
      const fileSeat = (this.seatsByJurisdiction.get(jurisdictionId) ?? []).find(
        (entry) => entry.seatHandle === leader!.handle,
      );
      const claimedUserHandle =
        dbSeat?.claimedUserHandle?.replace(/^@/, "").trim() ??
        fileSeat?.claimedUserHandle?.replace(/^@/, "").trim() ??
        null;
      if (dbSeat || fileSeat) {
        leader = {
          name: dbSeat?.representativeName ?? fileSeat?.name ?? leader.name,
          handle: leader.handle,
          ...(claimedUserHandle
            ? { claimedUserHandle, claimed: true }
            : { claimed: false, claimedUserHandle: null }),
        };
      }
    }
    return {
      id: j.id,
      level: j.level,
      ...(j.label !== undefined ? { label: j.label } : {}),
      ...(j.labels !== undefined ? { labels: j.labels } : {}),
      gates: j.gates ?? DEFAULT_GATES,
      graduationThreshold: graduationThreshold(j),
      ...(j.recognizedAccreditationBodyIds !== undefined
        ? { recognizedAccreditationBodyIds: j.recognizedAccreditationBodyIds }
        : {}),
      ...(leader !== undefined ? { leader } : {}),
      ...(j.rulesCopy !== undefined ? { rulesCopy: j.rulesCopy } : {}),
    };
  }

  /** Effective-dated district detail for one stable slug (P8). Unknown jurisdiction or slug ⇒ 404. */
  async getDistrictBySlug(
    jurisdictionId: string,
    slug: string,
    opts: { asOf?: string } = {},
  ): Promise<DistrictDetail> {
    this.requireJurisdictionConfig(jurisdictionId);
    const asOf = this.resolveAsOf(opts.asOf);
    const items = await this.geoStore.listDistrictsAsOf(jurisdictionId, new Date(`${asOf}T00:00:00Z`));
    const row = items.find((d) => d.districtSlug === slug);
    if (!row) throw new ServiceError("not_found", `unknown district: ${slug}`);
    return mapDistrictDetail(
      jurisdictionId,
      row,
      new Date(`${asOf}T00:00:00Z`),
      this.geoStore,
      this.seatsByJurisdiction.get(jurisdictionId) ?? [],
    );
  }

  /** The registered jurisdiction index — id + level + optional public label, per-record-type labels,
   *  content caps, and Media recognition body ids. Policy fields (rules/privacy/counts) stay internal. */
  listJurisdictions(): JurisdictionSummary[] {
    return this.jurisdictionIds.map((id) => getRegisteredJurisdiction(id)).map((j) => ({
      id: j.id,
      level: j.level,
      ...(j.label !== undefined ? { label: j.label } : {}),
      ...(j.labels !== undefined ? { labels: j.labels } : {}),
      ...(j.contentLimits !== undefined ? { contentLimits: j.contentLimits } : {}),
      ...(j.recognizedAccreditationBodyIds !== undefined
        ? { recognizedAccreditationBodyIds: j.recognizedAccreditationBodyIds }
        : {}),
    }));
  }

  /** The effective-dated district directory for a jurisdiction at `asOf` (default: today UTC). One
   *  revision per riding (latest effective_date <= asOf). A registered jurisdiction with no ingested
   *  boundaries yields an empty list (200). Unknown jurisdiction ⇒ 404. */
  async listDistricts(
    jurisdictionId: string,
    opts: { asOf?: string; includeGeometry?: boolean } = {},
  ): Promise<DistrictDirectory> {
    this.requireJurisdictionConfig(jurisdictionId);
    const asOf = this.resolveAsOf(opts.asOf);
    const asOfDate = new Date(`${asOf}T00:00:00Z`);
    const items = await this.geoStore.listDistrictsAsOf(jurisdictionId, asOfDate, {
      includeGeometry: opts.includeGeometry,
    });
    const fileSeats = this.seatsByJurisdiction.get(jurisdictionId) ?? [];
    const enriched = await Promise.all(
      items.map((row) =>
        enrichDistrictListItem(jurisdictionId, row, asOfDate, this.geoStore, fileSeats),
      ),
    );
    return { jurisdictionId, asOf, items: enriched };
  }

  /** Official GeoJSON (4326 MultiPolygon) for ONE district revision by id. Any ingested revision is
   *  fetchable, including superseded redraws (audit). 404 when the jurisdiction is unknown, the
   *  revision is unknown, or the revision belongs to a different jurisdiction. */
  async getDistrictGeometry(jurisdictionId: string, revisionId: string): Promise<unknown> {
    this.requireJurisdictionConfig(jurisdictionId);
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

  private requireJurisdictionConfig(id: string): JurisdictionConfig {
    if (!this.jurisdictionIds.includes(id)) {
      throw new ServiceError("not_found", `unknown jurisdiction: ${id}`);
    }
    return getRegisteredJurisdiction(id);
  }

  private resolveAsOf(asOf?: string): string {
    if (asOf === undefined) return utcDateString(new Date());
    if (!ASOF_RE.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
      throw new ServiceError("validation", `asOf must be a UTC calendar date (YYYY-MM-DD): ${asOf}`);
    }
    return asOf;
  }
}

function graduationThreshold(j: JurisdictionConfig): number | null {
  const g = j.graduation;
  return g && g.threshold.kind === "fixed" ? g.threshold.n : null;
}

/** Year anchor encoded in the revision id suffix (e.g. edmonton-city-centre-2019 → 2019). */
function boundaryYearFromRevisionId(id: string): number | null {
  const m = id.match(/-(\d{4})(?:-\d+)?$/);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

async function mapDistrictDetail(
  jurisdictionId: string,
  row: DistrictCatalogRow,
  asOf: Date,
  geoStore: GeoStore,
  fileSeats: OfficialSeatRecord[],
): Promise<DistrictDetail> {
  const dbSeat = await geoStore.getOfficialSeatForDistrict(jurisdictionId, row.districtSlug, asOf);
  const fileSeat = fileSeats.find(
    (entry) => entry.seatKind === "district_mla" && entry.districtSlug === row.districtSlug,
  );
  const representativeName = dbSeat?.representativeName ?? fileSeat?.name ?? null;
  const seatHandle = dbSeat?.seatHandle ?? fileSeat?.seatHandle ?? null;
  const claimedUserHandle = dbSeat?.claimedUserHandle?.replace(/^@/, "").trim() ?? null;
  return {
    name: row.name,
    slug: row.districtSlug,
    jur: jurisdictionId,
    boundaryYear: boundaryYearFromRevisionId(row.id),
    effectiveDate: row.effectiveDate,
    ...(row.source ? { sourceName: row.source } : {}),
    leader: representativeName,
    leaderHandle: seatHandle,
    claimedUserHandle,
    leaderClaimed: Boolean(claimedUserHandle),
    about: null,
  };
}

async function enrichDistrictListItem(
  jurisdictionId: string,
  row: DistrictCatalogRow,
  asOf: Date,
  geoStore: GeoStore,
  fileSeats: OfficialSeatRecord[],
): Promise<DistrictListItem> {
  const dbSeat = await geoStore.getOfficialSeatForDistrict(jurisdictionId, row.districtSlug, asOf);
  const fileSeat = fileSeats.find(
    (entry) => entry.seatKind === "district_mla" && entry.districtSlug === row.districtSlug,
  );
  const leader = dbSeat?.representativeName ?? fileSeat?.name;
  const seatHandle = dbSeat?.seatHandle ?? fileSeat?.seatHandle;
  const claimedUserHandle = dbSeat?.claimedUserHandle?.replace(/^@/, "").trim() ?? null;
  return {
    ...row,
    ...(leader != null ? { leader } : {}),
    ...(seatHandle != null
      ? {
          leaderHandle: seatHandle,
          seatHandle,
          claimedUserHandle,
          leaderClaimed: Boolean(claimedUserHandle),
        }
      : {}),
  };
}
