/**
 * Seed persona shapes and fixed anchors. Random users are generated in seed-orchestrator.ts.
 */

export type SeedVisibility =
  | "anonymous"
  | "id_verified"
  | "my_jurisdiction"
  | "my_district"
  | "all_officials"
  | "my_officials"
  | "public";

export interface SeedPerson {
  handle: string;
  name: string;
  /** 0 unverified · 1 identity · 2 residency · 3 official-role. */
  tier: 0 | 1 | 2 | 3;
  districts?: string[];
  visibility?: SeedVisibility;
  /** Roster seat handles to claim after accounts exist (links geo.official_seats + membership). */
  seatClaims?: readonly string[];
  /** Jurisdiction-wide official without a roster seat (e.g. Legislature showcase account). */
  legislatureOfficial?: boolean;
  /** Custom jurisdiction-wide official title (stored in profile memo), e.g. "Legislature". */
  officialTitle?: string;
  jurisdictions?: string[];
}

export const GLOBAL_ID = "oursay-global";
export const ALBERTA_ID = "ab-ca-gov";

/** Fixed officials + visibility showcase accounts (mixed into the random pool). */
export const SEED_ANCHORS: readonly SeedPerson[] = [
  {
    handle: "oursay",
    name: "OurSay Stewards",
    tier: 3,
    visibility: "public",
    seatClaims: ["global-platform"],
  },
  {
    handle: "strathcona_local",
    name: "Morgan Strathcona",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "my_district",
    jurisdictions: [ALBERTA_ID],
  },
  {
    handle: "whyte_public",
    name: "Priya Whyte",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "public",
    jurisdictions: [ALBERTA_ID],
  },
  {
    handle: "centre_district",
    name: "Owen Centre",
    tier: 2,
    districts: ["edmonton-city-centre"],
    visibility: "my_district",
    jurisdictions: [ALBERTA_ID],
  },
  {
    handle: "global_public",
    name: "Dana Cloud",
    tier: 1,
    visibility: "public",
  },
  {
    handle: "anon_voice",
    name: "Alex Quiet",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "anonymous",
    jurisdictions: [ALBERTA_ID],
  },
  {
    handle: "ableg",
    name: "Alberta Assembly",
    tier: 3,
    visibility: "public",
    jurisdictions: [ALBERTA_ID],
    legislatureOfficial: true,
    officialTitle: "Legislature",
  },
  // No seed accounts for REAL people (legal: impersonation / fabricated speech),
  // and no seeded claims on real government seats — a fictional claimant would
  // misrepresent the office. Real officials appear only as unclaimed roster
  // seats served from jurisdiction-data (public record) with the auto-generated
  // "has not endorsed this platform" bio. The claimed-seat UX is demonstrated by
  // the fictional mock corpus (web-app) and exercised by test 36.
];

/** Visibility mix for generated users (weights). */
export const GENERATED_VISIBILITY_MIX: readonly { visibility: SeedVisibility; weight: number }[] = [
  { visibility: "public", weight: 3 },
  { visibility: "my_district", weight: 3 },
  { visibility: "anonymous", weight: 2 },
  { visibility: "id_verified", weight: 2 },
  { visibility: "my_jurisdiction", weight: 1 },
];

export const DISTRICT_SLUGS = [
  "edmonton-strathcona",
  "edmonton-city-centre",
  "calgary-elbow",
] as const;

export const FIRST_NAMES = [
  "Jordan",
  "Sam",
  "Rosa",
  "Wei",
  "Lena",
  "Marcus",
  "Bea",
  "Hana",
  "Owen",
  "Priti",
  "Kai",
  "Noor",
  "Elliot",
  "Sage",
  "Remy",
] as const;

export const LAST_NAMES = [
  "Chen",
  "Klein",
  "Park",
  "Driver",
  "Shah",
  "Fletcher",
  "Nowak",
  "Okafor",
  "Lee",
  "Anand",
  "Vance",
  "Nguyen",
  "Morin",
  "Patel",
  "Santos",
] as const;
