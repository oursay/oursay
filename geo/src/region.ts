// Region — the service-layer filter unit. Every district is a region; not every region is a district.
// Product/count code asks `region.contains(point)` and NEVER branches on raw district_id lists, so the
// same call site works for a single district, a union, a whole-jurisdiction extent, a custom shape, or a
// boolean COMPOSITE (and/or/not of other regions).
//
// A leaf Region is a value object that already holds the SPECIFIC district revisions selected for the
// relevant instant (the RegionResolver did the effective-dated `asOf` selection when it built this
// Region), plus a GeoStore handle to run the single point-in-polygon query. Custom regions resolve
// against their own stored geometry instead of a district union. A `composite` Region instead holds a
// boolean tree of sub-Regions and evaluates `contains` by walking it (and/or/not) — `not` is bounded by
// a universe Region (the jurisdiction) so "everywhere except X" stays inside the jurisdiction.

import type { RegionRefOp } from "./region-ref.js";
import type { GeoStore, LngLat } from "./store.js";

export type RegionKind = "district" | "district_union" | "jurisdiction" | "custom" | "composite";

/** The boolean node a `composite` Region evaluates. `bound` is the negation universe (jurisdiction),
 *  required for `not` and ignored otherwise. */
export interface RegionNode {
  op: RegionRefOp;
  children: Region[];
  bound?: Region;
}

export class Region {
  constructor(
    private readonly store: GeoStore,
    readonly id: string,
    readonly kind: RegionKind,
    readonly jurisdictionId: string,
    /** Revision ids that compose this region (empty for a pure custom-geometry or composite region). */
    readonly districtIds: string[],
    /** True for a stored custom preset whose geometry lives in geo.regions. */
    readonly hasOwnGeom: boolean,
    /** Present only for `kind === "composite"`: the boolean tree to evaluate in `contains`. */
    readonly node?: RegionNode,
  ) {}

  /** Build a `composite` Region that evaluates `node` (and/or/not) in `contains`. */
  static composite(store: GeoStore, id: string, jurisdictionId: string, node: RegionNode): Region {
    return new Region(store, id, "composite", jurisdictionId, [], false, node);
  }

  /** Point-in-polygon: is `point` (EPSG:4326 lon/lat) inside this region? A leaf runs one PostGIS query;
   *  a composite walks its boolean tree (each leaf still one query). */
  async contains(point: LngLat): Promise<boolean> {
    if (this.node) return this.evalNode(this.node, point);
    if (this.hasOwnGeom) return this.store.customRegionContains(this.id, point);
    return this.store.districtsContain(this.districtIds, point);
  }

  private async evalNode(node: RegionNode, point: LngLat): Promise<boolean> {
    switch (node.op) {
      case "or": {
        for (const c of node.children) if (await c.contains(point)) return true;
        return false;
      }
      case "and": {
        for (const c of node.children) if (!(await c.contains(point))) return false;
        return node.children.length > 0;
      }
      case "not": {
        // not(X) ≡ jurisdiction ∖ X: inside the bounding universe but outside the child.
        if (node.bound && !(await node.bound.contains(point))) return false;
        return node.children.length > 0 ? !(await node.children[0].contains(point)) : false;
      }
    }
  }

  /** Whether this region currently resolves to any geometry (a `my-district` stub with no viewer, or
   *  a jurisdiction with no ingested boundaries, is empty → contains() is always false). For a composite
   *  this is a conservative structural check (the exact extent is only known per-point). */
  get isEmpty(): boolean {
    if (this.node) {
      switch (this.node.op) {
        case "or":
          return this.node.children.length === 0 || this.node.children.every((c) => c.isEmpty);
        case "and":
          return this.node.children.length === 0 || this.node.children.some((c) => c.isEmpty);
        case "not":
          return !this.node.bound || this.node.bound.isEmpty;
      }
    }
    return !this.hasOwnGeom && this.districtIds.length === 0;
  }
}
