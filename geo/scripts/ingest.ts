// Boundary / seat ingest CLI — redirects operators to the signed @oursay/api path.
//
//   npm run -w @oursay/geo ingest                 # → latest Alberta set via admin:jurisdiction
//   npm run -w @oursay/geo ingest -- 2023         # → --set 2023
//   npm run -w @oursay/geo ingest -- 2019
//   npm run -w @oursay/geo ingest -- 2019 --reset # wipe geo tables first (guarded; unsigned reset only)
//
// District and seat rows are written through platform-ops (district_upsert / official_seat_upsert).
// Low-level ingestBoundaries / ingestOfficialSeats remain for unit tests only.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDestructiveAllowed } from "../../scripts/destructive-guard.js";
import { paths, pgConfig } from "../src/config.js";
import { resolveBoundarySet } from "../src/ingest/boundary-sets.js";
import { GeoStore } from "../src/store.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const setArg = args.find((a) => !a.startsWith("-")) ?? "latest";
  const reset = args.includes("--reset");

  // Preserve historical aliases: bare "2019" / "2023" still work; default is now latest.
  const setId = setArg === "latest" || setArg === "2019" || setArg === "2023" ? setArg : null;
  if (!setId) {
    console.error(`Unknown boundary set "${setArg}" (expected latest | 2019 | 2023)`);
    process.exit(2);
  }

  if (reset) {
    assertDestructiveAllowed("geo ingest --reset");
    const store = new GeoStore(pgConfig);
    await store.init();
    await store.reset();
    console.log("geo: reset (geo.districts, geo.regions truncated)");
    await store.close();
  }

  // Validate the set exists before spawning the signed CLI.
  const set = resolveBoundarySet("ab-ca-gov", setId);
  console.log(
    `geo: redirecting to signed ingest (ab-ca-gov set=${set.id}, effective ${set.effectiveDate})…`,
  );
  console.log(`geo: repo root ${paths.repoRoot}`);

  const r = spawnSync(
    "npm",
    [
      "run",
      "admin:jurisdiction",
      "-w",
      "@oursay/api",
      "--",
      "stand-up",
      "ab-ca-gov",
      "--set",
      set.id,
    ],
    { cwd: repoRoot, stdio: "inherit", shell: true, env: process.env },
  );
  process.exit(r.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
