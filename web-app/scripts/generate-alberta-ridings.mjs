import { open } from "shapefile";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMBINING = /[\u0300-\u036f]/g;

function districtSlug(name) {
  return name
    .normalize("NFD")
    .replace(COMBINING, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FIRST = [
  "Alex", "Jordan", "Sam", "Priya", "Marcus", "Rae", "Hana", "Wei", "Rosa", "Dale",
  "Tom", "Lena", "Joss", "Morgan", "Casey", "Quinn", "Avery", "Blake", "Cameron", "Dana",
  "Elliot", "Finley", "Harper", "Indigo", "Jamie", "Kai", "Logan", "Noah", "Owen", "Parker",
  "Reese", "Sage", "Taylor", "Uma", "Violet", "Wren", "Xander", "Yuki", "Zara", "Nina",
  "Omar", "Leila", "Ethan", "Maya", "Lucas", "Sofia", "Emma", "Liam", "Olivia", "Aiden",
];
const LAST = [
  "Nguyen", "Chen", "Lee", "Shah", "Klein", "Friesen", "Berg", "Park", "Ferns", "Whitecloud",
  "Anand", "Driver", "Okafor", "Vance", "Singh", "Patel", "Kim", "Wong", "Martinez", "Johnson",
  "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson",
  "Martin", "Thompson", "Garcia", "Robinson", "Clark", "Lewis", "Walker", "Hall", "Allen", "Young",
  "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Hill", "Campbell", "Rivera",
];

const OVERRIDES = {
  "edmonton-strathcona": { name: "Rae Nguyen", handle: "raenguyen" },
  "calgary-elbow": { name: "Tom Berg", handle: "tomberg" },
  "edmonton-city-centre": { name: "Lena Park", handle: "lenapark" },
  "calgary-mountain-view": { name: "Joss Ferns", handle: "jossferns" },
};

const shp = join(
  __dirname,
  "..",
  "..",
  "jurisdiction-data",
  "ab-ca-gov",
  "districts",
  "ElectionsAlberta",
  "2019",
  "EDS_ENACTED_BILL33_15DEC2017.shp",
);
const src = await open(shp);
const names = new Set();
for (let res = await src.read(); !res.done; res = await src.read()) {
  const n = String(res.value.properties.EDName2017 ?? "").trim();
  if (n) names.add(n);
}

const ridings = [...names]
  .sort()
  .map((name, i) => {
    const slug = districtSlug(name);
    const o = OVERRIDES[slug];
    const mla = o ?? {
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`,
      handle: `${slug.slice(0, 14).replace(/-/g, "")}mla`,
    };
    return { name, slug, mla };
  });

const header = `/** Auto-generated from Elections Alberta 2019 boundaries — run \`node scripts/generate-alberta-ridings.mjs\`. */
import type { AlbertaRiding } from "./types";

export const ALBERTA_RIDINGS: AlbertaRiding[] = `;

writeFileSync(
  join(__dirname, "..", "src", "lib", "mock", "alberta-ridings.ts"),
  header + JSON.stringify(ridings, null, 2) + ";\n",
);
console.log(`Wrote ${ridings.length} ridings`);
