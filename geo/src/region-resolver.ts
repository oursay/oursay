// RegionResolver — builds Regions from ids, district unions, or a whole-jurisdiction extent, and
// compiles coarse public-API inputs (GeoScope) into a Region. The `asOf` factories perform the
// effective-dated selection: the boundary set in force on `asOf` is one revision per riding (latest
// effective_date <= asOf). The `compileScope` hook is the seam the public read service will consume in
// a later phase — it is NOT wired to any HTTP route in this task.

import { Region } from "./region.js";
import type { GeoStore } from "./store.js";

/** Coarse public audience selector (mirrors the api GeoScope stub). */
export type GeoScope = "jurisdiction" | "impacted-region" | "my-district" | "all-public";

/** Inputs available when compiling a coarse scope into a concrete Region. */
export interface ScopeInput {
  scope: GeoScope;
  jurisdictionId: string;
  /** An entity's governance district extent (EntityRules.appliesToDistrictIds); empty ⇒ whole jurisdiction. */
  appliesToDistrictIds?: string[];
  /** An authenticated viewer's inferred district revision id; absent on unauthenticated routes. */
  viewerDistrictId?: string;
  /** The instant the boundary set is resolved against (entity creation, poll open, …). Defaults to now. */
  asOf?: Date;
}

export interface RegionResolverDeps {
  geoStore: GeoStore;
}

export class RegionResolver {
  constructor(private readonly d: RegionResolverDeps) {}

  /** A region covering exactly one district revision. */
  forDistrict(districtId: string, jurisdictionId = "oursay-global"): Region {
    return new Region(this.d.geoStore, districtId, "district", jurisdictionId, [districtId], false);
  }

  /** A region covering the additive union of the given district revisions. */
  fromDistrictUnion(districtIds: string[], jurisdictionId = "oursay-global"): Region {
    const id = `union:${districtIds.join("+")}`;
    return new Region(this.d.geoStore, id, "district_union", jurisdictionId, districtIds, false);
  }

  /** The whole-jurisdiction extent as of `asOf`: one revision per riding in force on that date. */
  async forJurisdiction(jurisdictionId: string, asOf: Date = new Date()): Promise<Region> {
    const districtIds = await this.d.geoStore.districtIdsAsOf(jurisdictionId, asOf);
    const id = `jurisdiction:${jurisdictionId}@${asOf.toISOString().slice(0, 10)}`;
    return new Region(this.d.geoStore, id, "jurisdiction", jurisdictionId, districtIds, false);
  }

  /** Resolve a region id: a stored custom/platform preset, else a single district revision id. */
  async resolve(regionId: string): Promise<Region> {
    const row = await this.d.geoStore.getRegion(regionId);
    if (row) {
      if (row.hasGeom) {
        return new Region(this.d.geoStore, row.id, "custom", row.jurisdictionId, row.districtIds ?? [], true);
      }
      return new Region(this.d.geoStore, row.id, row.kind, row.jurisdictionId, row.districtIds ?? [], false);
    }
    if (await this.d.geoStore.districtExists(regionId)) {
      // jurisdiction is unknown from the id alone; containment does not depend on it.
      return this.forDistrict(regionId);
    }
    throw new Error(`Region not found: ${regionId}`);
  }

  /**
   * Compile a coarse GeoScope into a Region, or `null` when the scope implies no geo filter. STUB
   * SEAM — not called from any route in this task. `asOf` is threaded through even though HTTP passes
   * nothing yet.
   *   jurisdiction    → whole jurisdiction extent at asOf
   *   impacted-region → union of the entity's appliesToDistrictIds (empty ⇒ whole jurisdiction)
   *   my-district     → the viewer's district, or null (inert: no viewer identity on public routes)
   *   all-public      → null (no geo filter)
   */
  async compileScope(input: ScopeInput): Promise<Region | null> {
    const asOf = input.asOf ?? new Date();
    switch (input.scope) {
      case "jurisdiction":
        return this.forJurisdiction(input.jurisdictionId, asOf);
      case "impacted-region":
        return input.appliesToDistrictIds && input.appliesToDistrictIds.length > 0
          ? this.fromDistrictUnion(input.appliesToDistrictIds, input.jurisdictionId)
          : this.forJurisdiction(input.jurisdictionId, asOf);
      case "my-district":
        return input.viewerDistrictId ? this.forDistrict(input.viewerDistrictId, input.jurisdictionId) : null;
      case "all-public":
        return null;
    }
  }
}
