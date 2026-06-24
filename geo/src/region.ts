// Region — the service-layer filter unit. Every district is a region; not every region is a district.
// Product/count code asks `region.contains(point)` and NEVER branches on raw district_id lists, so the
// same call site works for a single district, a union, a whole-jurisdiction extent, or a custom shape.
//
// A Region is a value object that already holds the SPECIFIC district revisions selected for the
// relevant instant (the RegionResolver did the effective-dated `asOf` selection when it built this
// Region), plus a GeoStore handle to run the single point-in-polygon query. Custom regions resolve
// against their own stored geometry instead of a district union.

import type { GeoStore, LngLat } from "./store.js";

export type RegionKind = "district" | "district_union" | "jurisdiction" | "custom";

export class Region {
  constructor(
    private readonly store: GeoStore,
    readonly id: string,
    readonly kind: RegionKind,
    readonly jurisdictionId: string,
    /** Revision ids that compose this region (empty for a pure custom-geometry region). */
    readonly districtIds: string[],
    /** True for a stored custom preset whose geometry lives in geo.regions. */
    readonly hasOwnGeom: boolean,
  ) {}

  /** Point-in-polygon: is `point` (EPSG:4326 lon/lat) inside this region? One PostGIS query. */
  async contains(point: LngLat): Promise<boolean> {
    if (this.hasOwnGeom) return this.store.customRegionContains(this.id, point);
    return this.store.districtsContain(this.districtIds, point);
  }

  /** Whether this region currently resolves to any geometry (a `my-district` stub with no viewer, or
   *  a jurisdiction with no ingested boundaries, is empty → contains() is always false). */
  get isEmpty(): boolean {
    return !this.hasOwnGeom && this.districtIds.length === 0;
  }
}
