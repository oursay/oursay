/**
 * Ingest official seat roster via signed official_seat_upsert platform-ops.
 *
 *   npm run admin:seat-ingest -w @oursay/api -- --jurisdiction ab-ca-gov [--set latest|2019|2023]
 *   npm run admin:seat-ingest -w @oursay/api -- --jurisdiction oursay-global [--set latest|2019|2023]
 *
 * Dates come from the boundary set (or a synthetic default for jurisdictions without districts).
 * For ab-ca-gov, also upserts the oursay-global platform steward aligned to the same dates.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { boundarySetsFor, latestBoundarySet, resolveBoundarySet } from "@oursay/geo";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";
import { assertAdminCliAllowed, parseFlag } from "./lib/admin-cli.js";
import { applyBoundaryAlignedSeats } from "./lib/audited-ingest.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-seat-ingest --jurisdiction <id> [--set latest|2019|2023]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  ops soft-key: PLATFORM_OPS_ADMIN_PRIVKEY";

function seatDates(
  jurisdictionId: string,
  setId: string,
): { effectiveDate: string; boundaryYear: number; setLabel: string } {
  const sets = boundarySetsFor(jurisdictionId);
  if (sets.length > 0) {
    const set = resolveBoundarySet(jurisdictionId, setId);
    return {
      effectiveDate: set.effectiveDate,
      boundaryYear: set.boundaryYear,
      setLabel: set.id,
    };
  }
  // No district sets (e.g. oursay-global): align to Alberta's chosen/latest set when possible.
  const ab =
    setId === "latest"
      ? latestBoundarySet("ab-ca-gov")
      : boundarySetsFor("ab-ca-gov").find((s) => s.id === setId) ?? latestBoundarySet("ab-ca-gov");
  if (!ab) {
    return { effectiveDate: "2019-04-16", boundaryYear: 2019, setLabel: "default" };
  }
  return { effectiveDate: ab.effectiveDate, boundaryYear: ab.boundaryYear, setLabel: ab.id };
}

async function main(): Promise<void> {
  assertAdminCliAllowed("admin-seat-ingest");
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

  let dates;
  try {
    dates = seatDates(jurisdictionId, setId);
  } catch (err) {
    console.error(`[admin-seat-ingest] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const ops = await ensureOpsServiceAccount(services);
    console.error(
      `[admin-seat-ingest] jurisdiction=${jurisdictionId} set=${dates.setLabel} ` +
        `effective=${dates.effectiveDate}`,
    );
    await applyBoundaryAlignedSeats(services, ops, {
      jurisdictionId,
      effectiveDate: dates.effectiveDate,
      boundaryYear: dates.boundaryYear,
    });
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-seat-ingest] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-seat-ingest] fatal:", err);
  process.exit(1);
});
