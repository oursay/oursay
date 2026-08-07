/**
 * Ingest packaged accreditation bodies for a jurisdiction into the platform catalog,
 * then apply recognizedAccreditationBodyIds via jurisdiction_config_set (replace).
 *
 *   npm run admin:accreditation-body-ingest -w @oursay/api -- --jurisdiction ab-ca-gov
 *   npm run admin:accreditation-body-ingest -w @oursay/api -- --jurisdiction ab-ca-gov --add-bodies
 *   npm run admin:accreditation-body-ingest -w @oursay/api -- --jurisdiction ab-ca-gov --force
 *
 * Default: fail closed if a packaged id is missing from auth.accreditation_bodies.
 * --add-bodies / --force: create unknown bodies and update drifted names.
 *
 * Development (NODE_ENV=development) always allowed.
 * Production requires OURSAY_ALLOW_PROD_ADMIN=1.
 *
 * Optional actor for catalog audit: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";
import { assertAdminCliAllowed, hasFlag, parseFlag } from "./lib/admin-cli.js";
import { ingestAccreditationBodiesForJurisdiction } from "./lib/accreditation-body-ingest.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-accreditation-body-ingest --jurisdiction <id> [--add-bodies|--force]\n" +
  "  sync packaged bodies → auth.accreditation_bodies, then apply recognition via jurisdiction_config_set\n" +
  "  default: abort if a packaged id is missing from the catalog\n" +
  "  --add-bodies / --force: create unknown bodies and update drifted names\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  audit actor: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID\n" +
  "  ops soft-key: PLATFORM_OPS_ADMIN_PRIVKEY";

async function main(): Promise<void> {
  assertAdminCliAllowed("admin-accreditation-body-ingest");
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
    console.error(USAGE);
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const jurisdictionId = parseFlag(argv, "--jurisdiction");
  if (!jurisdictionId) {
    console.error(USAGE);
    process.exit(2);
  }

  const addBodies = hasFlag(argv, "--add-bodies") || hasFlag(argv, "--force");
  let grantedBy: string | null = process.env.OURSAY_ADMIN_ACTOR_ID?.trim() || null;
  const grantedByFlag = parseFlag(argv, "--granted-by");
  if (grantedByFlag) grantedBy = grantedByFlag;

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    if (grantedBy) {
      const actor = await services.repos.user.getById(grantedBy);
      if (!actor) {
        console.error(`[admin-accreditation-body-ingest] --granted-by user not found: ${grantedBy}`);
        process.exit(1);
      }
    }
    const ops = await ensureOpsServiceAccount(services);
    const result = await ingestAccreditationBodiesForJurisdiction(services, ops, {
      jurisdictionId,
      addBodies,
      grantedByAdminId: grantedBy,
      log: (m) => console.error(`[admin-accreditation-body-ingest] ${m}`),
    });
    console.error(
      `[admin-accreditation-body-ingest] done ${jurisdictionId}: ` +
        `created=${result.created} renamed=${result.renamed} activated=${result.activated} ` +
        `unchanged=${result.skipped} warnings=${result.warnings.length}`,
    );
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-accreditation-body-ingest] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(
      `[admin-accreditation-body-ingest] ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-accreditation-body-ingest] fatal:", err);
  process.exit(1);
});
