/**
 * Settlement + anchoring worker: a long-running process that settles pooled civic blocks and
 * publishes file (+ optional EVM) anchors for a SET of chains, reusing BlockSettler + AnchorPublisher
 * (docs/01 §3.4: pool → settle → publish). Run with: `npm run worker --workspace public-record`
 * (after `npm run db:up --workspace public-record`; alongside `npm run dev --workspace @oursay/api`).
 *
 * Bootstrap mirrors scripts/seed.ts (connect → run → close). Graceful shutdown is worker-specific:
 * SIGTERM/SIGINT stop the loop AFTER the in-flight tick (never mid-settlement), then close the DB
 * connections. The worker is non-destructive (it never calls store.reset()), so it runs in any
 * NODE_ENV. Run exactly ONE worker per chain (the settler is single-proposer-per-chain).
 *
 * EVM: start the local node with `npm run dev:up -w @oursay/evm-anchor` (auto-deploys; writes
 * `evm-anchor/.evm/address`). ethers stays inside EvmAnchorTarget — this script only wires config.
 *
 * Each chain uses its own immudb database under one LedgerInstance (ledgerId).
 */
import { BundleAssembler } from "../src/anchor/assembler.js";
import { AnchorPublisher } from "../src/anchor/publisher.js";
import { createEvmTargetsForChains } from "../src/anchor/evm.target.js";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks, type AnchorTarget } from "../src/anchor/target.js";
import {
  evmAnchorConfig,
  outboxConfig,
  pgConfig,
  workerChainConfigs,
  workerConfig,
} from "../src/config.js";
import { LedgerInstance } from "../src/ledger/instance.js";
import { BlockSettler } from "../src/ledger/settler.js";
import { PrivateStore } from "../src/private/store.js";
import { type ChainRunner, SettlementWorker } from "../src/worker/settlement-worker.js";

async function main(): Promise<void> {
  const ledger = new LedgerInstance();
  const store = new PrivateStore(pgConfig);
  await store.init(); // NOT reset() — the worker is non-destructive

  const chainConfigs = workerChainConfigs();
  // Ensure each jurisdiction DB exists + genesis meta before settlement.
  for (const c of chainConfigs) {
    await ledger.createDatabaseFor(c.chainId);
  }

  // One shared NonceManager across all chains (inside createEvmTargetsForChains).
  const sharedEvmTargets = createEvmTargetsForChains(
    chainConfigs.map((c) => ({ chainId: c.chainId, evmEveryNBlocks: c.evmEveryNBlocks })),
    evmAnchorConfig,
  );
  const evmTargetByChainId = new Map(
    sharedEvmTargets.map((t, i) => [chainConfigs[i].chainId, t] as const),
  );

  const runners: ChainRunner[] = [];
  for (const c of chainConfigs) {
    const connector = await ledger.getConnector(c.chainId);
    const targets: AnchorTarget[] = [
      new FileAnchorTarget(c.anchorDir, everyNBlocks(c.fileEveryNBlocks)),
    ];
    const evm = evmTargetByChainId.get(c.chainId);
    if (evm) targets.push(evm);
    runners.push({
      chainId: c.chainId,
      blockConfig: c.blockConfig,
      settler: new BlockSettler(store, connector, c.chainId, c.blockConfig, outboxConfig),
      publisher: new AnchorPublisher(connector, new BundleAssembler(store), c.chainId, store),
      targets,
    });
  }

  const worker = new SettlementWorker({
    runners,
    maxIdleMs: workerConfig.maxIdleMs,
    minIntervalMs: workerConfig.minIntervalMs,
    log: console,
  });

  // catchUpAll runs inside run() before the tick loop (integrity failures are fatal).
  // After Hardhat wipe + redeploy, restart this process so catch-up republishes to the new contract.
  const runPromise = worker.run();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — finishing in-flight tick, then closing`);
    worker.stop();
    await runPromise.catch((err) => console.error("[worker] run loop error during shutdown:", err));
    await store.close();
    await ledger.close();
    console.log("[worker] closed. bye.");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await runPromise;
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
