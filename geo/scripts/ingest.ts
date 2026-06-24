// Boundary ingest CLI. Loads an Elections Alberta shapefile into geo.districts.
//
//   npm run -w @oursay/geo ingest            # primary: 2019 Bill-33 districts (87 ridings)
//   npm run -w @oursay/geo ingest -- 2023    # secondary: dissolve 2023 voting areas → ridings
//   npm run -w @oursay/geo ingest -- 2019 --reset   # wipe geo tables first (guarded)
//
// Ingest itself is an idempotent upsert (re-running the same set is a no-op overwrite). `--reset` is
// the only destructive action and is guarded against NODE_ENV=production.

import { join } from "node:path";
import { assertDestructiveAllowed } from "../../scripts/destructive-guard.js";
import { paths, pgConfig } from "../src/config.js";
import { ingestBoundaries, ShapefileSource, type BoundarySource } from "../src/ingest/source.js";
import { GeoStore } from "../src/store.js";

const DATA = join(paths.repoRoot, "jurisdiction-data", "ab-ca-gov", "districts", "ElectionsAlberta");

/** Named Alberta boundary sets. EPSG comes from each .prj (NAD83 10TM; Resource=3402, Forest=3400). */
function source(set: string): BoundarySource {
  switch (set) {
    case "2019":
      // Bill-33 (enacted 2017-12-15), in force for the 2019 general election. Already district-level.
      return new ShapefileSource({
        sourceId: "ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
        jurisdictionId: "ab-ca-gov",
        effectiveDate: "2019-04-16",
        drawnDate: "2017-12-15",
        boundaryYear: 2019,
        srid: 3401, // NAD83 / Alberta 10-TM (Resource), FE=0 — matches the .prj
        shpPath: join(DATA, "2019", "EDS_ENACTED_BILL33_15DEC2017.shp"),
        fieldMap: { name: "EDName2017", ref: "EDNumber20" },
      });
    case "2023":
      // 4,765 voting areas → dissolve by ED_NUM into ridings (same Bill-33 seats, finer source).
      return new ShapefileSource({
        sourceId: "ElectionsAlberta/EA_Voting_Area_Boundaries_2023",
        jurisdictionId: "ab-ca-gov",
        effectiveDate: "2023-05-29",
        drawnDate: "2017-12-15",
        boundaryYear: 2023,
        srid: 3400,
        shpPath: join(DATA, "2025", "EA_Voting_Area_Boundaries_2023.shp"),
        fieldMap: { name: "ED_NAME", ref: "ED_NUM" },
        dissolveBy: "ED_NUM",
      });
    default:
      throw new Error(`Unknown boundary set "${set}" (expected 2019 | 2023)`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const set = args.find((a) => !a.startsWith("-")) ?? "2019";
  const reset = args.includes("--reset");

  const store = new GeoStore(pgConfig);
  await store.init();
  if (reset) {
    assertDestructiveAllowed("geo ingest --reset");
    await store.reset();
    console.log("geo: reset (geo.districts, geo.regions truncated)");
  }

  console.log(`geo: ingesting set ${set} …`);
  const result = await ingestBoundaries(store, source(set));
  const total = await store.countDistricts(result.jurisdictionId);
  console.log(
    `geo: ingested ${result.count} districts (${result.jurisdictionId}, year ${result.boundaryYear}, ` +
      `effective ${result.effectiveDate}); ${total} total in jurisdiction.`,
  );
  await store.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
