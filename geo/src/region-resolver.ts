// RegionResolver — builds Regions from ids, district unions, or a whole-jurisdiction extent, and
// compiles coarse public-API inputs (GeoScope) into a Region. The `asOf` factories perform the
// effective-dated selection: the boundary set in force on `asOf` is one revision per riding (latest
// effective_date <= asOf). The `compileScope` hook is the seam the public read service will consume in
// a later phase — it is NOT wired to any HTTP route in this task.

import { Region } from "./region.js";
import {
  isRegionRefUnion,
  parseBaseRef,
  regionRefFromDistrictIds,
  type ParsedBaseRef,
  type RegionRef,
} from "./region-ref.js";
import type { GeoStore } from "./store.js";

/** Coarse public audience selector (mirrors the api GeoScope stub). */
export type GeoScope = "jurisdiction" | "impacted-region" | "my-district" | "all-public";

/** The instant + jurisdiction a RegionRef is resolved against. */
export interface RegionRefContext {
  jurisdictionId: string;
  asOf: Date;
}

/** Inputs available when compiling a coarse scope into a concrete Region. */
export interface ScopeInput {
  scope: GeoScope;
  jurisdictionId: string;
  /** An entity's geographic stake (EntityRules.appliesToRegion); absent ⇒ whole jurisdiction. Takes
   *  precedence over the deprecated `appliesToDistrictIds` alias when both are present. */
  appliesToRegion?: RegionRef;
  /** DEPRECATED alias for `appliesToRegion`: an entity's raw district revision extent
   *  (EntityRules.appliesToDistrictIds); empty ⇒ whole jurisdiction. Mapped to an OR-of-revisions RegionRef. */
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
   * Resolve a {@link RegionRef} (the geographic stake on EntityRules.appliesToRegion) into a Region at
   * `ctx.asOf`:
   *   "jurisdiction"             → whole jurisdiction extent at asOf
   *   "district:<district_slug>" → the stable seat's revision in force at asOf (empty region if none yet)
   *   "revision:<revisionId>"    → that pinned boundary revision
   *   "region:<presetId>"        → the stored custom/platform preset
   *   { op: "or",  refs }        → a pure OR over district-based refs COLLAPSES to a district_union
   *                                 (so a legacy appliesToDistrictIds stake resolves byte-identically);
   *                                 otherwise a composite OR
   *   { op: "and", refs }        → composite AND (a point must be in every child)
   *   { op: "not", refs }        → composite NOT, bounded by the jurisdiction (not(X) ≡ jurisdiction ∖ X)
   */
  async resolveRegionRef(ref: RegionRef, ctx: RegionRefContext): Promise<Region> {
    if (!isRegionRefUnion(ref)) return this.resolveBaseRef(parseBaseRef(ref), ctx);

    const children = await Promise.all(ref.refs.map((r) => this.resolveRegionRef(r, ctx)));
    switch (ref.op) {
      case "or": {
        // Collapse to a single district_union when every child is a plain district-based region (no
        // custom geometry, no nested composite) — preserves the pre-RegionRef union behavior exactly.
        if (children.every((c) => !c.node && !c.hasOwnGeom)) {
          const ids = [...new Set(children.flatMap((c) => c.districtIds))];
          return this.fromDistrictUnion(ids, ctx.jurisdictionId);
        }
        return Region.composite(this.d.geoStore, "composite:or", ctx.jurisdictionId, { op: "or", children });
      }
      case "and":
        return Region.composite(this.d.geoStore, "composite:and", ctx.jurisdictionId, { op: "and", children });
      case "not": {
        const bound = await this.forJurisdiction(ctx.jurisdictionId, ctx.asOf);
        return Region.composite(this.d.geoStore, "composite:not", ctx.jurisdictionId, { op: "not", children, bound });
      }
    }
  }

  /** Resolve a parsed base (non-union) ref. A `district:<slug>` with no revision in force at asOf yields
   *  an empty district_union (contains() always false) rather than throwing. */
  private async resolveBaseRef(ref: ParsedBaseRef, ctx: RegionRefContext): Promise<Region> {
    switch (ref.kind) {
      case "jurisdiction":
        return this.forJurisdiction(ctx.jurisdictionId, ctx.asOf);
      case "district": {
        const revisionId = await this.d.geoStore.districtIdBySlugAsOf(ctx.jurisdictionId, ref.slug, ctx.asOf);
        return revisionId
          ? this.forDistrict(revisionId, ctx.jurisdictionId)
          : new Region(this.d.geoStore, `district:${ref.slug}@empty`, "district_union", ctx.jurisdictionId, [], false);
      }
      case "revision":
        return this.forDistrict(ref.revisionId, ctx.jurisdictionId);
      case "region":
        return this.resolve(ref.presetId);
    }
  }

  /**
   * Compile a coarse GeoScope into a Region, or `null` when the scope implies no geo filter. `asOf` is
   * threaded through (HTTP passes `now` today).
   *   jurisdiction    → whole jurisdiction extent at asOf
   *   impacted-region → the entity's appliesToRegion (or the legacy appliesToDistrictIds alias);
   *                     absent/empty ⇒ whole jurisdiction
   *   my-district     → the viewer's district, or null (inert: no viewer identity on public routes)
   *   all-public      → null (no geo filter)
   */
  async compileScope(input: ScopeInput): Promise<Region | null> {
    const asOf = input.asOf ?? new Date();
    switch (input.scope) {
      case "jurisdiction":
        return this.forJurisdiction(input.jurisdictionId, asOf);
      case "impacted-region": {
        const ref =
          input.appliesToRegion ??
          (input.appliesToDistrictIds && input.appliesToDistrictIds.length > 0
            ? regionRefFromDistrictIds(input.appliesToDistrictIds)
            : undefined);
        return ref
          ? this.resolveRegionRef(ref, { jurisdictionId: input.jurisdictionId, asOf })
          : this.forJurisdiction(input.jurisdictionId, asOf);
      }
      case "my-district":
        return input.viewerDistrictId ? this.forDistrict(input.viewerDistrictId, input.jurisdictionId) : null;
      case "all-public":
        return null;
    }
  }
}
