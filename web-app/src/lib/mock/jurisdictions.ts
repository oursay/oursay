import type { JurisdictionSummary } from "@/lib/types";

/** Per-jurisdiction config (wireframe JUR_DATA). Global has no map or ridings. */
export const JUR_DATA: Record<string, JurisdictionSummary> = {
  Global: {
    name: "Global",
    leader: { name: "OurSay Stewards" },
    rules: [
      "Open policy — any member may post any root type.",
      "Statements, Petitions and Polls are open to all.",
      "Verified posts are written to the public ledger.",
      "Unverified posts stay off-ledger.",
      "Counts appear once past the k-anonymity floor.",
    ],
    districtLabel: null,
    districts: [],
  },
  Alberta: {
    name: "Alberta",
    leader: { name: "Hon. A. Premier" },
    rules: [
      "Ladder policy — levels graduate upward.",
      "Statements: open to any registered member.",
      "Petitions: residency-verified authors only.",
      "Polls: via petition→poll graduation threshold.",
      "Verified actions are written on-ledger.",
      "Official counts: residency-verified electors only.",
    ],
    districtLabel: "Ridings",
    districts: [
      { name: "Edmonton-Strathcona", leader: "Rae Nguyen" },
      { name: "Calgary-Elbow", leader: "Tom Berg" },
      { name: "Edmonton-City Centre", leader: "Lena Park" },
      { name: "Calgary-Mountain View", leader: "Joss Ferns" },
    ],
  },
};

/** District slug -> display name (wireframe DISTRICT_NAMES). */
export const DISTRICT_NAMES: Record<string, string> = {
  "edmonton-strathcona": "Edmonton-Strathcona",
  "edmonton-city-centre": "Edmonton-City Centre",
  "calgary-elbow": "Calgary-Elbow",
  "calgary-mountain-view": "Calgary-Mountain View",
  "calgary-forest-lawn": "Calgary-Forest Lawn",
};

export function districtName(slug: string): string {
  return DISTRICT_NAMES[slug] ?? slug;
}
