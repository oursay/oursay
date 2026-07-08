// Slug + seat-handle primitives now come from the shared @oursay/slugs package (single source of
// truth across geo, jurisdiction-data, and web-app). Re-exported here to preserve existing import
// paths. TODO(slug-promotion): this module lives under lib/mock/ for historical reasons but holds
// real utilities, not mock data — promote it (and other genuine helpers) out of mock/ into lib/
// proper. See plan R8 follow-up + the TODO(slug-promotion) marker in ../official-seat.ts.
export {
  districtSlug,
  districtShortSlug,
  districtSeatHandle,
  jurisdictionLeaderSeatHandle,
} from "@oursay/slugs";
