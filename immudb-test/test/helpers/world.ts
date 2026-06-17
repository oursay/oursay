import { rmSync } from "node:fs";
import { immudbConfig, pgConfig } from "../../src/config.js";
import { connectLedger, type ImmuClient } from "../../src/immudb.js";
import { PrivateStore } from "../../src/privateStore.js";
import { Ledger } from "../../src/ledger.js";

export interface World {
  immu: ImmuClient;
  priv: PrivateStore;
  ledger: Ledger;
}

let world: World | undefined;

/**
 * Lazily create ONE shared connection for the whole test run. immudb is append-only,
 * so we never "reset" the ledger — tests use unique (UUID) ids. The private Postgres
 * store IS reset per run for isolation. We delete the local trusted-state file first so
 * each run re-anchors from the server's current state (avoids stale-root false failures).
 */
export async function getWorld(): Promise<World> {
  if (world) return world;
  rmSync(immudbConfig.rootPath, { force: true });
  const immu = await connectLedger(immudbConfig);
  const priv = new PrivateStore(pgConfig);
  await priv.init();
  await priv.reset();
  world = { immu, priv, ledger: new Ledger(immu, priv) };
  return world;
}

/** Seed three users so authorRefs map to real private identities. */
export async function seedUsers(priv: PrivateStore): Promise<void> {
  await priv.putUser({ id: "alice", handle: "alice", email: "alice@oursay.test" });
  await priv.putUser({ id: "bob", handle: "bob", email: "bob@oursay.test" });
  await priv.putUser({ id: "carol", handle: "carol", email: "carol@oursay.test" });
  await priv.putKey({ id: "alice-k1", userId: "alice", pubkey: "0xpub-alice", privkey: "0xpriv-alice" });
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
