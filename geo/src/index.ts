// @oursay/geo — public API. Geographic foundation for OurSay: PostGIS-backed electoral district
// boundaries, a first-class Region model, pluggable boundary ingest, and an effective-dated
// RegionResolver. Consumed by @oursay/api (and later @oursay/public-record) via services. This
// package builds the substrate for geo filtering; it does NOT wire any public /v1/public/… filter.

export { GeoStore } from "./store.js";
export type { LngLat, DistrictUpsert, DistrictCatalogRow, RegionRow } from "./store.js";

export { Region } from "./region.js";
export type { RegionKind } from "./region.js";

export { RegionResolver } from "./region-resolver.js";
export type { GeoScope, ScopeInput, RegionResolverDeps } from "./region-resolver.js";

export { ShapefileSource, ingestBoundaries, ridingSlug } from "./ingest/source.js";
export type {
  BoundarySource,
  RawDistrict,
  IngestResult,
  ShapefileFieldMap,
  ShapefileSourceOptions,
} from "./ingest/source.js";

export { pgConfig, paths } from "./config.js";
export type { PgConfig } from "./config.js";
