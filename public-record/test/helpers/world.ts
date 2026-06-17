import { immudbPgConfig, pgConfig } from "../../src/config.js";
import { PublicChain } from "../../src/ledger/chain.js";
import { PgWireLedgerConnector } from "../../src/ledger/pgwire.connector.js";
import { PrivateStore } from "../../src/private/store.js";
import { RecordService } from "../../src/record.js";

export interface World {
  connector: PgWireLedgerConnector;
  store: PrivateStore;
  chain: PublicChain;
  svc: RecordService;
}

let world: World | undefined;

/**
 * One shared connection for the whole run. immudb is append-only, so it is never reset —
 * entities use fresh UUIDs. The private Postgres store IS reset per run for isolation.
 */
export async function getWorld(): Promise<World> {
  if (world) return world;
  const connector = new PgWireLedgerConnector(immudbPgConfig);
  await connector.connect();
  const store = new PrivateStore(pgConfig);
  await store.init();
  await store.reset();
  const chain = new PublicChain(connector, store);
  world = { connector, store, chain, svc: new RecordService(chain, store) };
  return world;
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
