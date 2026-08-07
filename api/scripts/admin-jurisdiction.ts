/**
 * Jurisdiction stand-up and granular signed ingest.
 *
 *   npm run admin:jurisdiction -w @oursay/api -- stand-up <jurisdictionId> [--set latest|2019|2023] [--evm] [--add-bodies|--force]
 *   npm run admin:jurisdiction -w @oursay/api -- config <jurisdictionId>
 *   npm run admin:jurisdiction -w @oursay/api -- districts <jurisdictionId> [--set latest|2019|2023]
 *   npm run admin:jurisdiction -w @oursay/api -- seats <jurisdictionId> [--set latest|2019|2023]
 *   npm run admin:jurisdiction -w @oursay/api -- verify <jurisdictionId>
 *
 * stand-up: create/open immudb chain → ops account → accreditation-body ingest + config → districts (if any) → seats → verify.
 * Seat claims remain `admin:seat claim`.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { boundarySetsFor, resolveBoundarySet } from "@oursay/geo";
import { jurisdictions } from "@oursay/jurisdiction-data";
import { dbNameForChain, LedgerInstance, ledgerConfig } from "@oursay/public-record";
import { buildServices, type Services } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import { ensureOpsServiceAccount, type EnsuredOpsAccount } from "../src/helpers/ops-account.js";
import { assertAdminCliAllowed, hasFlag, parseFlag, positionals } from "./lib/admin-cli.js";
import { ingestAccreditationBodiesForJurisdiction } from "./lib/accreditation-body-ingest.js";
import {
  applyBoundaryAlignedSeats,
  applyDistrictSource,
  applyJurisdictionConfigs,
  printJurisdictionAuditSummary,
  verifyJurisdictionAudit,
} from "./lib/audited-ingest.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-jurisdiction <stand-up|config|districts|seats|verify> <jurisdictionId> [opts]\n" +
  "  stand-up <id> [--set latest|2019|2023] [--evm] [--add-bodies|--force]\n" +
  "  config|districts|seats|verify <id> [--set …]\n" +
  "  stand-up runs accreditation-body ingest before config (fail-closed unless --add-bodies/--force)\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  ops soft-key: PLATFORM_OPS_ADMIN_PRIVKEY";

function requireConfig(jurisdictionId: string) {
  const config = jurisdictions.find((j) => j.id === jurisdictionId);
  if (!config) {
    throw new Error(
      `unknown jurisdiction "${jurisdictionId}" (packaged: ${jurisdictions.map((j) => j.id).join(", ")})`,
    );
  }
  return config;
}

async function ensureChain(jurisdictionId: string, withEvm: boolean): Promise<void> {
  const dbName = dbNameForChain(jurisdictionId);
  console.error(`[admin-jurisdiction] ledgerId=${ledgerConfig.ledgerId}`);
  console.error(`[admin-jurisdiction] chainId=${jurisdictionId} → database=${dbName}`);
  const ledger = new LedgerInstance();
  try {
    const result = await ledger.createDatabaseFor(jurisdictionId);
    const connector = await ledger.getConnector(jurisdictionId);
    const metaLedger = await connector.getMeta("ledger_id");
    const metaChain = await connector.getMeta("chain_id");
    console.error(
      `[admin-jurisdiction] chain ok meta ledger_id=${metaLedger} chain_id=${metaChain} db=${result.databaseName}`,
    );
  } finally {
    await ledger.close();
  }
  if (withEvm) {
    const r = spawnSync(
      "npm",
      ["run", "create:chain", "-w", "@oursay/evm-anchor", "--", jurisdictionId],
      { cwd: repoRoot, stdio: "inherit", shell: true },
    );
    if ((r.status ?? 1) !== 0) {
      throw new Error(`EVM create:chain failed with status ${r.status ?? 1}`);
    }
  }
}

async function withServices<T>(fn: (services: Services, ops: EnsuredOpsAccount) => Promise<T>): Promise<T> {
  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const ops = await ensureOpsServiceAccount(services);
    return await fn(services, ops);
  } finally {
    await db.close();
  }
}

async function cmdConfig(jurisdictionId: string): Promise<void> {
  const config = requireConfig(jurisdictionId);
  await withServices(async (services, ops) => {
    await applyJurisdictionConfigs(services, ops, [config]);
  });
}

async function cmdDistricts(jurisdictionId: string, setId: string): Promise<void> {
  requireConfig(jurisdictionId);
  if (boundarySetsFor(jurisdictionId).length === 0) {
    console.error(`[admin-jurisdiction] ${jurisdictionId} has no boundary datasets — skipping districts`);
    return;
  }
  const set = resolveBoundarySet(jurisdictionId, setId);
  await withServices(async (services, ops) => {
    console.error(`[admin-jurisdiction] districts set=${set.id} (${set.label})`);
    await applyDistrictSource(services, ops, set.build());
  });
}

async function cmdSeats(jurisdictionId: string, setId: string): Promise<void> {
  requireConfig(jurisdictionId);
  const sets = boundarySetsFor(jurisdictionId);
  let effectiveDate: string;
  let boundaryYear: number;
  if (sets.length > 0) {
    const set = resolveBoundarySet(jurisdictionId, setId);
    effectiveDate = set.effectiveDate;
    boundaryYear = set.boundaryYear;
  } else {
    // Align steward seats to Alberta's selected/latest set when this jurisdiction has no districts.
    const ab = resolveBoundarySet("ab-ca-gov", setId === "latest" ? "latest" : setId);
    effectiveDate = ab.effectiveDate;
    boundaryYear = ab.boundaryYear;
  }
  await withServices(async (services, ops) => {
    console.error(
      `[admin-jurisdiction] seats jurisdiction=${jurisdictionId} effective=${effectiveDate}`,
    );
    await applyBoundaryAlignedSeats(services, ops, {
      jurisdictionId,
      effectiveDate,
      boundaryYear,
      includeGlobalSteward: jurisdictionId === "ab-ca-gov" || jurisdictionId === "oursay-global",
    });
  });
}

async function cmdVerify(jurisdictionId: string): Promise<void> {
  requireConfig(jurisdictionId);
  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const summary = await verifyJurisdictionAudit(services, jurisdictionId);
    printJurisdictionAuditSummary(summary, (m) => console.error(m));
    const ok =
      summary.config.present &&
      summary.districts.withAuditLink === summary.districts.total &&
      summary.seats.withAuditLink === summary.seats.total;
    if (!ok) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

async function cmdAccreditationBodies(
  jurisdictionId: string,
  addBodies: boolean,
): Promise<void> {
  requireConfig(jurisdictionId);
  await withServices(async (services, ops) => {
    await ingestAccreditationBodiesForJurisdiction(services, ops, {
      jurisdictionId,
      addBodies,
      log: (m) => console.error(`[admin-jurisdiction] ${m}`),
    });
  });
}

async function cmdStandUp(
  jurisdictionId: string,
  setId: string,
  withEvm: boolean,
  addBodies: boolean,
): Promise<void> {
  requireConfig(jurisdictionId);
  await ensureChain(jurisdictionId, withEvm);
  // Catalog sync + recognition list before/with config (helper also applies jurisdiction_config_set).
  await cmdAccreditationBodies(jurisdictionId, addBodies);
  await cmdDistricts(jurisdictionId, setId);
  await cmdSeats(jurisdictionId, setId);
  await cmdVerify(jurisdictionId);
  console.error(
    `[admin-jurisdiction] stand-up complete for ${jurisdictionId}. ` +
      `Claim seats with: npm run admin:seat -w @oursay/api -- claim <email> <seatHandle>`,
  );
}

async function main(): Promise<void> {
  assertAdminCliAllowed("admin-jurisdiction");
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
    console.error(USAGE);
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const pos = positionals(argv);
  const cmd = pos[0];
  const jurisdictionId = pos[1];
  if (!cmd || !jurisdictionId || !["stand-up", "config", "districts", "seats", "verify"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }

  const setId = parseFlag(argv, "--set") ?? "latest";
  const withEvm = hasFlag(argv, "--evm");
  const addBodies = hasFlag(argv, "--add-bodies") || hasFlag(argv, "--force");

  try {
    if (cmd === "stand-up") await cmdStandUp(jurisdictionId, setId, withEvm, addBodies);
    else if (cmd === "config") await cmdConfig(jurisdictionId);
    else if (cmd === "districts") await cmdDistricts(jurisdictionId, setId);
    else if (cmd === "seats") await cmdSeats(jurisdictionId, setId);
    else await cmdVerify(jurisdictionId);
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-jurisdiction] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(`[admin-jurisdiction] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[admin-jurisdiction] fatal:", err);
  process.exit(1);
});
