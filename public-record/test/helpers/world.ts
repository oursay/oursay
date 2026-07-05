import { randomUUID } from "node:crypto";
import { BundleAssembler } from "../../src/anchor/assembler.js";
import { AnchorPublisher } from "../../src/anchor/publisher.js";
import { blockConfig, immudbPgConfig, pgConfig } from "../../src/config.js";
import { PublicChain } from "../../src/ledger/chain.js";
import { PgWireLedgerConnector } from "../../src/ledger/pgwire.connector.js";
import { BlockSettler } from "../../src/ledger/settler.js";
import { PrivateStore } from "../../src/private/store.js";
import { RecordService } from "../../src/record.js";

export interface World {
  connector: PgWireLedgerConnector;
  store: PrivateStore;
  chain: PublicChain;
  svc: RecordService;
  settler: BlockSettler;
  /** This run's genesis/chain id — fresh per run so block heights start clean (immudb is never reset). */
  chainId: string;
}

/** A self-contained chain over the shared store+connector: the pooling svc and its settler/publisher
 *  all share one fresh `chainId`, so the pool tag matches what the settler drains. */
export interface ChainWorld {
  chainId: string;
  svc: RecordService;
  settler: BlockSettler;
  publisher: AnchorPublisher;
}

let world: World | undefined;

/**
 * One shared connection for the whole run. immudb is append-only, so it is never reset — entities
 * use fresh UUIDs and a fresh per-run `chainId` keeps block heights clean. The private Postgres store
 * IS reset per run for isolation. `append` now only POOLS a tx; `settleAll()` settles it to the chain.
 */
export async function getWorld(): Promise<World> {
  if (world) return world;
  const connector = new PgWireLedgerConnector(immudbPgConfig);
  await connector.connect();
  const store = new PrivateStore(pgConfig);
  await store.init();
  await store.reset();
  const chainId = randomUUID();
  const chain = new PublicChain(store, chainId);
  const settler = new BlockSettler(store, connector, chainId, blockConfig);
  world = { connector, store, chain, svc: new RecordService(chain, store), settler, chainId };
  return world;
}

/**
 * Build a fresh chain over the shared store+connector: a new `chainId` with its own pooling svc,
 * settler, and publisher all bound to it. Because `append` tags the pool with the svc's `chainId`
 * and the settler drains only that `chainId`, the producer and consumer always agree — and block
 * heights start at 1 (a fresh genesis on the never-reset immudb). Callers `store.reset()` per test.
 */
export async function freshChainWorld(cfg = blockConfig): Promise<ChainWorld> {
  const { store, connector } = await getWorld();
  const chainId = randomUUID();
  const svc = new RecordService(new PublicChain(store, chainId), store);
  const settler = new BlockSettler(store, connector, chainId, cfg);
  const publisher = new AnchorPublisher(connector, new BundleAssembler(store), chainId);
  return { chainId, svc, settler, publisher };
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
