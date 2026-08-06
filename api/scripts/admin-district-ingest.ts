/**
 * Ingest electoral districts via signed district_upsert platform-ops.
 *
 *   npm run admin:district-ingest -w @oursay/api -- --jurisdiction ab-ca-gov [--set latest|2019|2023]
 *
 * Default --set is latest (greatest effectiveDate).
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { resolveBoundarySet } from "@oursay/geo";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";
import { assertAdminCliAllowed, parseFlag } from "./lib/admin-cli.js";
import { applyDistrictSource } from "./lib/audited-ingest.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-district-ingest --jurisdiction <id> [--set latest|2019|2023]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  ops soft-key: PLATFORM_OPS_ADMIN_PRIVKEY";

async function main(): Promise<void> {
  assertAdminCliAllowed("admin-district-ingest");
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("-h") || argv.includes("--help")) {
    console.error(USAGE);
    process.exit(0);
  }

  const jurisdictionId = parseFlag(argv, "--jurisdiction");
  if (!jurisdictionId) {
    console.error(USAGE);
    process.exit(2);
  }
  const setId = parseFlag(argv, "--set") ?? "latest";

  let set;
  try {
    set = resolveBoundarySet(jurisdictionId, setId);
  } catch (err) {
    console.error(`[admin-district-ingest] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const ops = await ensureOpsServiceAccount(services);
    console.error(`[admin-district-ingest] set=${set.id} (${set.label})`);
    await applyDistrictSource(services, ops, set.build());
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-district-ingest] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-district-ingest] fatal:", err);
  process.exit(1);
});
