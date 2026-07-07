/**
 * Seed personas ported from web-app/src/lib/mock/people.ts (not imported — no Next aliases).
 * Tier: 0 unverified · 1 identity · 2 residency · 3 official-role UI (KYC = residency + role).
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
  /** Mock VerificationTier — drives kycService.attest + geocode. */
  tier: 0 | 1 | 2 | 3;
  districts?: string[];
  visibility?: SeedVisibility;
  /** When set, user gets official role in ab-ca-gov. */
  officialDistrict?: string | null;
  /** Extra jurisdiction memberships beyond oursay-global. */
  jurisdictions?: string[];
}

/** ~16 story anchors from the wireframe corpus (MLA stubs omitted). */
export const SEED_PEOPLE: SeedPerson[] = [
  { handle: "dwhitecloud", name: "Dana Whitecloud", tier: 0, visibility: "anonymous" },
  { handle: "oursay", name: "OurSay Stewards", tier: 3, visibility: "public", jurisdictions: ["ab-ca-gov"] },
  { handle: "priya", name: "Priya Anand", tier: 1, visibility: "id_verified" },
  { handle: "mlee", name: "Marcus Lee", tier: 1, visibility: "my_jurisdiction" },
  {
    handle: "premier",
    name: "Hon. A. Premier",
    tier: 3,
    visibility: "public",
    jurisdictions: ["ab-ca-gov"],
    officialDistrict: null,
  },
  {
    handle: "ableg",
    name: "Alberta Assembly",
    tier: 3,
    visibility: "public",
    jurisdictions: ["ab-ca-gov"],
    officialDistrict: null,
  },
  {
    handle: "jvance",
    name: "Jordan Vance",
    tier: 0,
    districts: ["edmonton-strathcona"],
    visibility: "my_district",
    jurisdictions: ["ab-ca-gov"],
  },
  {
    handle: "pshah",
    name: "Priti Shah",
    tier: 1,
    districts: ["calgary-elbow"],
    visibility: "my_district",
    jurisdictions: ["ab-ca-gov"],
  },
  {
    handle: "hanao",
    name: "Hana Okafor",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "public",
    jurisdictions: ["ab-ca-gov"],
  },
  {
    handle: "samd",
    name: "Sam Driver",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "all_officials",
    jurisdictions: ["ab-ca-gov"],
  },
  {
    handle: "rosak",
    name: "Rosa Klein",
    tier: 2,
    districts: ["calgary-elbow"],
    visibility: "my_officials",
    jurisdictions: ["ab-ca-gov"],
  },
  {
    handle: "weichen",
    name: "Wei Chen",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "public",
    jurisdictions: ["ab-ca-gov"],
  },
  { handle: "owenf", name: "Owen Fletcher", tier: 2, districts: ["edmonton-city-centre"], jurisdictions: ["ab-ca-gov"] },
  { handle: "beanowak", name: "Bea Nowak", tier: 2, districts: ["calgary-elbow"], jurisdictions: ["ab-ca-gov"] },
  {
    handle: "raenguyen",
    name: "Rae Nguyen",
    tier: 3,
    districts: ["edmonton-strathcona"],
    visibility: "public",
    jurisdictions: ["ab-ca-gov"],
    officialDistrict: "edmonton-strathcona",
  },
  {
    handle: "lenapark",
    name: "Lena Park",
    tier: 3,
    districts: ["edmonton-city-centre"],
    visibility: "public",
    jurisdictions: ["ab-ca-gov"],
    officialDistrict: "edmonton-city-centre",
  },
  {
    handle: "alex_morgan",
    name: "Alex Morgan",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "anonymous",
    jurisdictions: ["ab-ca-gov"],
  },
];

export const GLOBAL_ID = "oursay-global";
export const ALBERTA_ID = "ab-ca-gov";
