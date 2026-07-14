/**
 * Remove a jurisdiction's immudb database only (siblings untouched).
 *
 *   npm run jurisdiction:remove -w @oursay/public-record -- some-chain-id
 *
 * Refuses when NODE_ENV=production (destructive-guard). Optional --erase-content would erase
 * Postgres plaintext for that chain in a later loop; not wired here (shared Postgres store).
 */
import { assertDestructiveAllowed } from "../../scripts/destructive-guard.js";
import { dbNameForChain, ledgerConfig } from "../src/config.js";
import { LedgerInstance } from "../src/ledger/instance.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const chainId = args.find((a) => !a.startsWith("-"));
  if (!chainId) {
    console.error("usage: jurisdiction-remove <chainId>");
    process.exit(2);
  }
  if (args.includes("--erase-content")) {
    console.warn(
      "[jurisdiction-remove] --erase-content noted but not implemented this loop (shared Postgres; use erase() per tx)",
    );
  }

  assertDestructiveAllowed(`jurisdiction-remove ${chainId}`);

  const dbName = dbNameForChain(chainId);
  console.log(`[jurisdiction-remove] ledgerId=${ledgerConfig.ledgerId}`);
  console.log(`[jurisdiction-remove] dropping database=${dbName} for chainId=${chainId}`);

  const ledger = new LedgerInstance();
  const result = await ledger.dropDatabaseFor(chainId);
  await ledger.close();

  if (result === "unsupported") {
    console.error(
      "[jurisdiction-remove] DROP DATABASE not supported over pg-wire. " +
        `Use immuadmin unload / archive the data dir for ${dbName} under the immudb volume ` +
        `(compose project data). See docs/spikes/immudb/DB-PER-JURISDICTION.md.`,
    );
    process.exit(1);
  }
  console.log(`[jurisdiction-remove] dropped ${dbName}`);
}

main().catch((err) => {
  console.error("[jurisdiction-remove] fatal:", err);
  process.exit(1);
});
