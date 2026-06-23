/**
 * Settlement + anchoring worker: a long-running process that settles pooled civic blocks and
 * publishes file anchors for a SET of chains, reusing BlockSettler + AnchorPublisher (docs/01 §3.4:
 * pool → settle → publish). Run with: `npm run worker --workspace public-record`
 * (after `npm run db:up --workspace public-record`; alongside `npm run dev --workspace @oursay/api`).
 *
 * Bootstrap mirrors scripts/seed.ts (connect → run → close). Graceful shutdown is worker-specific:
 * SIGTERM/SIGINT stop the loop AFTER the in-flight tick (never mid-settlement), then close the DB
 * connections. The worker is non-destructive (it never calls store.reset()), so it runs in any
 * NODE_ENV. Run exactly ONE worker per chain (the settler is single-proposer-per-chain).
 */
import { BundleAssembler } from "../src/anchor/assembler.js";
import { AnchorPublisher } from "../src/anchor/publisher.js";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks } from "../src/anchor/target.js";
import { immudbPgConfig, outboxConfig, pgConfig, workerChainConfigs, workerConfig } from "../src/config.js";
import { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import { BlockSettler } from "../src/ledger/settler.js";
import { PrivateStore } from "../src/private/store.js";
import { type ChainRunner, SettlementWorker } from "../src/worker/settlement-worker.js";

async function main(): Promise<void> {
  const connector = new PgWireLedgerConnector(immudbPgConfig);
  await connector.connect();
  const store = new PrivateStore(pgConfig);
  await store.init(); // NOT reset() — the worker is non-destructive

  const runners: ChainRunner[] = workerChainConfigs().map((c) => ({
    chainId: c.chainId,
    blockConfig: c.blockConfig,
    settler: new BlockSettler(store, connector, c.chainId, c.blockConfig, outboxConfig),
    publisher: new AnchorPublisher(connector, new BundleAssembler(store), c.chainId),
    target: new FileAnchorTarget(c.anchorDir, everyNBlocks(c.fileEveryNBlocks)),
  }));

  const worker = new SettlementWorker({
    runners,
    maxIdleMs: workerConfig.maxIdleMs,
    minIntervalMs: workerConfig.minIntervalMs,
    log: console,
  });

  const runPromise = worker.run();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — finishing in-flight tick, then closing`);
    worker.stop();
    await runPromise.catch((err) => console.error("[worker] run loop error during shutdown:", err));
    await store.close();
    await connector.close();
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
