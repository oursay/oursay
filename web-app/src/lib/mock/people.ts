import { ALBERTA_RIDINGS } from "./alberta-ridings";
import { MY_HANDLE, MY_NAME } from "./constants";
import type { MockPerson } from "./types";

/**
 * Wireframe corpus authors and a few out-of-province residents.
 *
 * `visibility` spreads the demo's anonymity story (absent = public): as the
 * viewer cycles KYC 0→1→2→3 with home district edmonton-strathcona, authors
 * de-anonymize in waves — id_verified at tier 1; my_jurisdiction and the
 * in-district my_district authors at tier 2 (pshah stays a persona: wrong
 * district); all_officials at tier 3 (rosak stays: not the viewer's district).
 * Story anchors (oursay, premier, weichen, hanao, MLAs) stay public so the
 * existing demo flows don't regress.
 */
const EXTRA_PEOPLE: MockPerson[] = [
  { name: "Dana Whitecloud", handle: "dwhitecloud", tier: 0, visibility: "anonymous" },
  { name: "OurSay Stewards", handle: "oursay", tier: 3, role: "Platform stewards" },
  { name: "Priya Anand", handle: "priya", tier: 1, visibility: "id_verified" },
  { name: "Marcus Lee", handle: "mlee", tier: 1, visibility: "my_jurisdiction" },
  { name: "Hon. A. Premier", handle: "premier", tier: 3, role: "Premier · Alberta" },
  { name: "Alberta Assembly", handle: "ableg", tier: 3, role: "Alberta Assembly" },
  {
    name: "Jordan Vance",
    handle: "jvance",
    tier: 0,
    districts: ["edmonton-strathcona"],
    visibility: "my_district",
  },
  {
    name: "Priti Shah",
    handle: "pshah",
    tier: 1,
    districts: ["calgary-elbow"],
    visibility: "my_district",
  },
  { name: "Hana Okafor", handle: "hanao", tier: 2, districts: ["edmonton-strathcona"] },
  {
    name: "Sam Driver",
    handle: "samd",
    tier: 2,
    districts: ["edmonton-strathcona"],
    visibility: "all_officials",
  },
  {
    name: "Rosa Klein",
    handle: "rosak",
    tier: 2,
    districts: ["calgary-elbow"],
    visibility: "my_officials",
  },
  { name: "Wei Chen", handle: "weichen", tier: 2, districts: ["edmonton-strathcona"] },
  // Residency-verified neighbours used by the river-path petition thread to
  // demonstrate the residency glyph ladder: Owen is in the petition's *other*
  // affected riding (map-pin-check), Bea is elsewhere in Alberta and only
  // in-jurisdiction (map-pinned).
  { name: "Owen Fletcher", handle: "owenf", tier: 2, districts: ["edmonton-city-centre"] },
  { name: "Bea Nowak", handle: "beanowak", tier: 2, districts: ["calgary-elbow"] },
  {
    name: "Dale Friesen",
    handle: "dfriesen",
    tier: 1,
    districts: ["calgary-elbow", "calgary-mountain-view", "calgary-forest-lawn"],
    visibility: "my_jurisdiction",
  },
  { name: "Kevin O'Brien", handle: "kevinTO", tier: 1, role: "Toronto, ON", visibility: "anonymous" },
  { name: "Sarah Okamoto", handle: "sarahbc", tier: 2, role: "Vancouver, BC", visibility: "id_verified" },
  { name: "Marie Dubois", handle: "marieqc", tier: 1, role: "Montreal, QC", visibility: "all_officials" },
  { name: MY_NAME, handle: MY_HANDLE, tier: 2, districts: ["edmonton-strathcona"], role: "Edmonton-Strathcona" },
];

function mlaPerson(riding: (typeof ALBERTA_RIDINGS)[number]): MockPerson {
  return {
    name: riding.mla.name,
    handle: riding.mla.handle,
    tier: 3,
    districts: [riding.slug],
    role: `MLA · ${riding.name}`,
  };
}

const mlaPeople = ALBERTA_RIDINGS.map(mlaPerson);

/** All mock personas keyed by handle. Later entries override earlier (wireframe beats generated MLA). */
export const PEOPLE_BY_HANDLE: Record<string, MockPerson> = Object.fromEntries(
  [...mlaPeople, ...EXTRA_PEOPLE].map((p) => [p.handle, p]),
);

export function person(handle: string): MockPerson {
  // Unregistered handles fall back to a synthetic anonymous person: any mock
  // author not listed above is a permanent per-thread persona (and has no
  // profile page), matching the doc's anonymous floor.
  return (
    PEOPLE_BY_HANDLE[handle] ?? {
      name: handle,
      handle,
      tier: 0,
      visibility: "anonymous",
    }
  );
}

export function personDistricts(handle: string): string[] {
  return PEOPLE_BY_HANDLE[handle]?.districts ?? [];
}
