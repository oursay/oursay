/**
 * Create (or open) a jurisdiction's immudb database under the current ledgerId.
 * Idempotent: CREATE DATABASE + DDL + genesis meta (ledger_id, chain_id).
 *
 *   npm run jurisdiction:add -w @oursay/public-record -- ab-ca-gov
 *   npm run jurisdiction:add -w @oursay/public-record -- ab-ca-gov --evm
 *
 * --evm also calls SettlementAnchor.createChain (requires EVM_CONTRACT_ADDRESS / deploy).
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dbNameForChain, ledgerConfig } from "../src/config.js";
import { LedgerInstance } from "../src/ledger/instance.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const withEvm = args.includes("--evm");
  const chainId = args.find((a) => !a.startsWith("-"));
  if (!chainId) {
    console.error("usage: jurisdiction-add <chainId> [--evm]");
    process.exit(2);
  }

  const dbName = dbNameForChain(chainId);
  console.log(`[jurisdiction-add] ledgerId=${ledgerConfig.ledgerId}`);
  console.log(`[jurisdiction-add] chainId=${chainId} → database=${dbName}`);

  const ledger = new LedgerInstance();
  const result = await ledger.createDatabaseFor(chainId);
  const connector = await ledger.getConnector(chainId);
  const metaLedger = await connector.getMeta("ledger_id");
  const metaChain = await connector.getMeta("chain_id");
  console.log(`[jurisdiction-add] ok meta ledger_id=${metaLedger} chain_id=${metaChain}`);

  if (withEvm) {
    const r = spawnSync(
      "npm",
      ["run", "create:chain", "-w", "@oursay/evm-anchor", "--", chainId],
      { cwd: repoRoot, stdio: "inherit", shell: true },
    );
    if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
  }

  await ledger.close();
  console.log(`[jurisdiction-add] done ${result.databaseName}`);
}

main().catch((err) => {
  console.error("[jurisdiction-add] fatal:", err);
  process.exit(1);
});
