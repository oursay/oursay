import { randomUUID } from "node:crypto";
import { BundleAssembler } from "../../src/anchor/assembler.js";
import { AnchorPublisher } from "../../src/anchor/publisher.js";
import { blockConfig, pgConfig } from "../../src/config.js";
import { PublicChain } from "../../src/ledger/chain.js";
import { LedgerInstance } from "../../src/ledger/instance.js";
import type { PgWireLedgerConnector } from "../../src/ledger/pgwire.connector.js";
import { BlockSettler } from "../../src/ledger/settler.js";
import { PrivateStore } from "../../src/private/store.js";
import { RecordService } from "../../src/record.js";

export interface World {
  ledger: LedgerInstance;
  connector: PgWireLedgerConnector;
  store: PrivateStore;
  chain: PublicChain;
  svc: RecordService;
  settler: BlockSettler;
  /** This run's genesis/chain id — fresh per run so block heights start clean. */
  chainId: string;
  /** ChainIds that received a per-run database (dropped at teardown). */
  createdChainIds: string[];
}

/** A self-contained chain over the shared store+instance: the pooling svc and its settler/publisher
 *  all share one fresh `chainId`, so the pool tag matches what the settler drains. */
export interface ChainWorld {
  chainId: string;
  svc: RecordService;
  settler: BlockSettler;
  publisher: AnchorPublisher;
  connector: PgWireLedgerConnector;
}

let world: World | undefined;
/** Ephemeral chainIds from {@link freshChainWorld} in the current mocha test — closed in afterEach. */
let ephemeralThisTest: string[] = [];

/**
 * One shared LedgerInstance for the whole run. Each chainId gets its own immudb database.
 * The private Postgres store IS reset per run for isolation. `append` now only POOLS a tx;
 * `settleAll()` settles it to the chain.
 */
export async function getWorld(): Promise<World> {
  if (world) return world;
  const ledger = new LedgerInstance();
  const store = new PrivateStore(pgConfig);
  await store.init();
  await store.reset();
  const chainId = randomUUID();
  const connector = await ledger.createDatabaseFor(chainId).then(() => ledger.getConnector(chainId));
  const chain = new PublicChain(store, chainId, connector);
  const settler = new BlockSettler(store, connector, chainId, blockConfig);
  world = {
    ledger,
    connector,
    store,
    chain,
    svc: new RecordService(chain, store),
    settler,
    chainId,
    createdChainIds: [chainId],
  };
  return world;
}

/**
 * Close connectors (and best-effort DROP) for every created chain except `keep`.
 * Default keep = the shared world chain. Frees immudb active-snapshot budget between suites.
 */
export async function reclaimChains(keep?: string[]): Promise<void> {
  if (!world) return;
  const keepSet = new Set(keep ?? [world.chainId]);
  const next: string[] = [];
  for (const id of world.createdChainIds) {
    if (keepSet.has(id)) {
      next.push(id);
      continue;
    }
    try {
      await world.ledger.dropDatabaseFor(id);
    } catch {
      /* best-effort */
    }
  }
  world.createdChainIds = next;
}

/**
 * Build a fresh chain over the shared store+instance: a new `chainId` with its own pooling svc,
 * settler, and publisher all bound to it (and its own immudb database).
 * Released automatically in mocha afterEach via {@link releaseEphemeralChains}.
 */
export async function freshChainWorld(cfg = blockConfig): Promise<ChainWorld> {
  const w = await getWorld();
  const chainId = randomUUID();
  await w.ledger.createDatabaseFor(chainId);
  w.createdChainIds.push(chainId);
  ephemeralThisTest.push(chainId);
  const connector = await w.ledger.getConnector(chainId);
  const svc = new RecordService(new PublicChain(w.store, chainId, connector), w.store);
  const settler = new BlockSettler(w.store, connector, chainId, cfg);
  const publisher = new AnchorPublisher(connector, new BundleAssembler(w.store), chainId, w.store);
  return { chainId, svc, settler, publisher, connector };
}

/** Drop/close DBs created by {@link freshChainWorld} in the current test (mocha afterEach). */
export async function releaseEphemeralChains(): Promise<void> {
  if (!world || ephemeralThisTest.length === 0) {
    ephemeralThisTest = [];
    return;
  }
  const ids = ephemeralThisTest;
  ephemeralThisTest = [];
  for (const id of ids) {
    try {
      await world.ledger.dropDatabaseFor(id);
    } catch {
      /* best-effort */
    }
  }
  world.createdChainIds = world.createdChainIds.filter((id) => !ids.includes(id));
}

/**
 * Settle all currently-pending pooled txs onto the shared test chain, so immudb holds their
 * commitments. Tests that read immudb (getEnvelope / verifyRow / verifyEntityChain) call this first —
 * with enqueue-only `append`, a tx reaches the chain only at settlement.
 */
export async function settleAll(): Promise<void> {
  const w = await getWorld();
  await w.settler.flushPendingSettlement();
}

/** Drop per-run jurisdiction databases so immudb stays under the open-file ceiling. */
export async function teardownWorld(): Promise<void> {
  if (!world) return;
  const w = world;
  world = undefined;
  for (const id of w.createdChainIds) {
    try {
      await w.ledger.dropDatabaseFor(id);
    } catch {
      /* best-effort teardown */
    }
  }
  await w.store.close();
  await w.ledger.close();
}

/** Assert a promise rejects, without pulling in chai-as-promised. */
export async function rejects(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

/** ISO timestamp offset from now by `ms` (negative = past). */
export function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
