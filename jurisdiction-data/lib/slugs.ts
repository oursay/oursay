// Slug + seat-handle primitives now live in @oursay/slugs (the monorepo dependency floor) so geo,
// jurisdiction-data, and web-app share ONE implementation. Re-exported here to preserve this
// package's import surface (`./lib/slugs.js`).
export {
  districtSlug,
  districtShortSlug,
  jurisdictionLeaderSeatHandle,
  districtSeatHandle,
} from "@oursay/slugs";
