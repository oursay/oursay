/**
 * Fork a jurisdiction chain: create a new immudb database + ledger_meta lineage.
 * EVM forkChain is invoked when --evm is passed (requires a live SettlementAnchor).
 * Historical immudb row replay into the new DB is a follow-up; this loop records lineage and continues fresh.
 *
 *   npm run jurisdiction:fork -w @oursay/public-record -- ab-ca-gov 12 ab-ca-gov-v2 "reason" [--evm]
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dbNameForChain, ledgerConfig } from "../src/config.js";
import { LedgerInstance } from "../src/ledger/instance.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

async function main(): Promise<void> {
  const raw = process.argv.slice(2).filter((a) => a !== "--");
  const withEvm = raw.includes("--evm");
  const args = raw.filter((a) => !a.startsWith("-"));
  const [sourceChainId, heightStr, newChainId, ...reasonParts] = args;
  const reason = reasonParts.join(" ").trim();
  const atHeight = Number(heightStr);

  if (!sourceChainId || !newChainId || !reason || !Number.isInteger(atHeight) || atHeight < 1) {
    console.error(
      'usage: jurisdiction-fork <sourceChainId> <atHeight> <newChainId> "<reason>" [--evm]',
    );
    process.exit(2);
  }

  console.log(`[jurisdiction-fork] ledgerId=${ledgerConfig.ledgerId}`);
  console.log(
    `[jurisdiction-fork] ${sourceChainId}@${atHeight} → ${newChainId} (${dbNameForChain(newChainId)})`,
  );
  console.log(`[jurisdiction-fork] reason=${reason}`);

  const ledger = new LedgerInstance();
  await ledger.createDatabaseFor(sourceChainId);
  const source = await ledger.getConnector(sourceChainId);
  const atBlock = await source.fetchBlockByHeight(sourceChainId, atHeight);
  if (!atBlock) {
    throw new Error(`source block ${atHeight} not found on ${sourceChainId}`);
  }

  await ledger.createDatabaseFor(newChainId, {
    parentChainId: sourceChainId,
    forkHeight: atHeight,
    forkReason: reason,
  });
  const forked = await ledger.getConnector(newChainId);
  console.log(`[jurisdiction-fork] parent_chain_id=${await forked.getMeta("parent_chain_id")}`);
  console.log(`[jurisdiction-fork] fork_height=${await forked.getMeta("fork_height")}`);

  if (withEvm) {
    const r = spawnSync("npm", ["run", "fork:chain", "-w", "@oursay/evm-anchor"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        FORK_SOURCE_CHAIN_ID: sourceChainId,
        FORK_AT_HEIGHT: String(atHeight),
        FORK_NEW_CHAIN_ID: newChainId,
        FORK_REASON: reason,
        // bundle hash is validated inside fork-chain via on-chain storage; tip must match
      },
    });
    if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
  }

  await ledger.close();
  console.log("[jurisdiction-fork] done (lineage recorded; no historical row replay this loop)");
}

main().catch((err) => {
  console.error("[jurisdiction-fork] fatal:", err);
  process.exit(1);
});
