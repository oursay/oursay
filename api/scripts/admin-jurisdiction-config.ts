/**
 * Apply packaged JurisdictionConfig(s) via signed platform-ops.
 *
 *   npm run admin:jurisdiction-config -w @oursay/api -- [--jurisdiction <id>]
 *
 * Without --jurisdiction, applies every entry from @oursay/jurisdiction-data.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { jurisdictions } from "@oursay/jurisdiction-data";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";
import { assertAdminCliAllowed, parseFlag } from "./lib/admin-cli.js";
import { applyJurisdictionConfigs } from "./lib/audited-ingest.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-jurisdiction-config [--jurisdiction <id>]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  ops soft-key: PLATFORM_OPS_ADMIN_PRIVKEY";

async function main(): Promise<void> {
  assertAdminCliAllowed("admin-jurisdiction-config");
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("-h") || argv.includes("--help")) {
    console.error(USAGE);
    process.exit(0);
  }

  const jurisdictionId = parseFlag(argv, "--jurisdiction");
  const configs = jurisdictionId
    ? jurisdictions.filter((j) => j.id === jurisdictionId)
    : [...jurisdictions];
  if (configs.length === 0) {
    console.error(`[admin-jurisdiction-config] unknown jurisdiction: ${jurisdictionId}`);
    process.exit(1);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const ops = await ensureOpsServiceAccount(services);
    await applyJurisdictionConfigs(services, ops, configs);
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-jurisdiction-config] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-jurisdiction-config] fatal:", err);
  process.exit(1);
});
