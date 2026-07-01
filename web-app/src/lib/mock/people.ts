import { ALBERTA_RIDINGS } from "./alberta-ridings";
import type { MockPerson } from "./types";

/** Wireframe corpus authors and a few out-of-province residents. */
const EXTRA_PEOPLE: MockPerson[] = [
  { name: "Dana Whitecloud", handle: "dwhitecloud", tier: 0 },
  { name: "OurSay Stewards", handle: "oursay", tier: 3, role: "Platform stewards" },
  { name: "Priya Anand", handle: "priya", tier: 1 },
  { name: "Marcus Lee", handle: "mlee", tier: 1 },
  { name: "Hon. A. Premier", handle: "premier", tier: 3, role: "Premier · Alberta" },
  { name: "Alberta Assembly", handle: "ableg", tier: 3, role: "Alberta Assembly" },
  { name: "Jordan Vance", handle: "jvance", tier: 0, districts: ["edmonton-strathcona"] },
  { name: "Priti Shah", handle: "pshah", tier: 1, districts: ["calgary-elbow"] },
  { name: "Hana Okafor", handle: "hanao", tier: 2, districts: ["edmonton-strathcona"] },
  { name: "Sam Driver", handle: "samd", tier: 2, districts: ["edmonton-strathcona"] },
  { name: "Rosa Klein", handle: "rosak", tier: 2, districts: ["calgary-elbow"] },
  { name: "Wei Chen", handle: "weichen", tier: 2, districts: ["edmonton-strathcona"] },
  {
    name: "Dale Friesen",
    handle: "dfriesen",
    tier: 1,
    districts: ["calgary-elbow", "calgary-mountain-view", "calgary-forest-lawn"],
  },
  { name: "Kevin O'Brien", handle: "kevinTO", tier: 1, role: "Toronto, ON" },
  { name: "Sarah Okamoto", handle: "sarahbc", tier: 2, role: "Vancouver, BC" },
  { name: "Marie Dubois", handle: "marieqc", tier: 1, role: "Montreal, QC" },
  { name: "Alex Morgan", handle: "alexm", tier: 2, districts: ["edmonton-strathcona"], role: "Edmonton-Strathcona" },
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
  return (
    PEOPLE_BY_HANDLE[handle] ?? {
      name: handle,
      handle,
      tier: 0,
    }
  );
}

export function personDistricts(handle: string): string[] {
  return PEOPLE_BY_HANDLE[handle]?.districts ?? [];
}
