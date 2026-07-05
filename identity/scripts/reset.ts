// One "clean slate" command for the identity layer (the THIRD reset lever, alongside
// `store.reset()` in tests and `public-record` `db:down -v`). Wipes:
//   1. the simulated dev passkey custody (`.oursay-dev/`), and
//   2. the Postgres + immudb volumes (public-record `docker compose down -v`).
// After this there are no orphaned keys or chain state across runs.

import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDestructiveAllowed } from "../../scripts/destructive-guard.js";
import { defaultDevDir } from "../src/client/dev-connector.js";

assertDestructiveAllowed("npm run reset (@oursay/identity)");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", ".."); // identity/scripts → repo root
const publicRecordDir = join(repoRoot, "public-record");

// 1. dev passkey custody (no env flag needed to DESTROY)
const devDir = defaultDevDir();
rmSync(devDir, { recursive: true, force: true });
console.log(`✓ wiped dev passkey custody: ${devDir}`);

// 2. Postgres + immudb volumes
try {
  execFileSync("docker", ["compose", "down", "-v"], { cwd: publicRecordDir, stdio: "inherit" });
  console.log("✓ removed public-record Postgres + immudb volumes");
} catch {
  console.error("! `docker compose down -v` failed in public-record (is Docker running?) — custody was still wiped");
  process.exitCode = 1;
}

console.log("clean slate complete.");
