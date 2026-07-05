import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Curated 12-riding demo set (scaled down from the full Elections Alberta 2019
 * boundaries for the published demo).
 *
 * Invariants:
 *   - Exactly 12 ridings, each with a unique MLA name and handle.
 *   - The Premier (handle "premier") is the sitting MLA for Calgary-Lougheed.
 *   - Ridings referenced elsewhere in the corpus stay present so no district,
 *     profile, or persona link dangles.
 */
const DEMO_RIDINGS = [
  { name: "Banff-Kananaskis", slug: "banff-kananaskis", mla: { name: "Priya Wilson", handle: "banffkananaskmla" } },
  { name: "Calgary-Bow", slug: "calgary-bow", mla: { name: "Rosa Whitecloud", handle: "calgarybowmla" } },
  { name: "Calgary-Elbow", slug: "calgary-elbow", mla: { name: "Tom Berg", handle: "tomberg" } },
  { name: "Calgary-Forest Lawn", slug: "calgary-forest-lawn", mla: { name: "Nadia Rees", handle: "calgaryforestmla" } },
  { name: "Calgary-Lougheed", slug: "calgary-lougheed", mla: { name: "Hon. A. Premier", handle: "premier" } },
  { name: "Calgary-Mountain View", slug: "calgary-mountain-view", mla: { name: "Joss Ferns", handle: "jossferns" } },
  { name: "Edmonton-City Centre", slug: "edmonton-city-centre", mla: { name: "Lena Park", handle: "lenapark" } },
  { name: "Edmonton-Glenora", slug: "edmonton-glenora", mla: { name: "Lucas Driver", handle: "edmontonglenomla" } },
  { name: "Edmonton-Strathcona", slug: "edmonton-strathcona", mla: { name: "Rae Nguyen", handle: "raenguyen" } },
  { name: "Grande Prairie", slug: "grande-prairie", mla: { name: "Joss Hall", handle: "grandeprairiemla" } },
  { name: "Lethbridge-West", slug: "lethbridge-west", mla: { name: "Finley Nguyen", handle: "lethbridgewesmla" } },
  { name: "Red Deer-South", slug: "red-deer-south", mla: { name: "Owen Rivera", handle: "reddeersouthmla" } },
];

const header = `/**
 * Curated 12-riding demo set (scaled down from the full Elections Alberta 2019
 * boundaries) — run \`node scripts/generate-alberta-ridings.mjs\` to regenerate.
 *
 * Invariants the demo relies on:
 *   - Exactly 12 ridings, each with a unique MLA name and handle.
 *   - The Premier (handle "premier") is the sitting MLA for Calgary-Lougheed,
 *     so the province leader is also a district representative.
 *   - Ridings referenced elsewhere in the corpus stay present so no district,
 *     profile, or persona link dangles: edmonton-strathcona, edmonton-city-centre,
 *     calgary-elbow, calgary-mountain-view, calgary-forest-lawn.
 */
import type { AlbertaRiding } from "./types";

export const ALBERTA_RIDINGS: AlbertaRiding[] = `;

writeFileSync(
  join(__dirname, "..", "src", "lib", "mock", "alberta-ridings.ts"),
  header + JSON.stringify(DEMO_RIDINGS, null, 2) + ";\n",
);
console.log(`Wrote ${DEMO_RIDINGS.length} ridings`);
