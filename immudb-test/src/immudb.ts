import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ImmudbConfig } from "./config.js";
import type { ImmudbRoot } from "./types.js";

// immudb-node 1.1.1 is a CommonJS package whose .d.ts references the legacy `grpc`
// types (the runtime actually uses pure-JS @grpc/grpc-js). We load it via require and
// type only the surface we use, to keep the build clean under NodeNext ESM.
const require = createRequire(import.meta.url);

interface ImmuTrustedState {
  db: string;
  txid: number;
  txhash: Uint8Array;
  signature?: unknown;
}

export interface ImmuClient {
  login(p: { user: string; password: string }): Promise<unknown>;
  useDatabase(p: { databasename: string }): Promise<unknown>;
  set(p: { key: string; value: string }): Promise<unknown>;
  get(p: { key: string }): Promise<{ tx: number; key: string; value: string } | undefined>;
  verifiedSet(p: { key: string; value: string }): Promise<unknown>;
  verifiedGet(p: { key: string }): Promise<{ tx: number; key: string; value: string } | undefined>;
  currentState(): Promise<{ db: string; txid: number } | undefined>;
  health(): Promise<unknown>;
  shutdown?(): Promise<void>;
  state: { servers: Record<string, Record<string, ImmuTrustedState>> };
}

type ImmuClientCtor = new (cfg: {
  host: string;
  port: number;
  rootPath?: string;
}) => ImmuClient;

const pkg = require("immudb-node") as { default?: ImmuClientCtor } & ImmuClientCtor;
const ImmudbClient: ImmuClientCtor = pkg.default ?? pkg;

/** Connect, authenticate, and select the database. Returns a ready client. */
export async function connectLedger(cfg: ImmudbConfig): Promise<ImmuClient> {
  mkdirSync(dirname(cfg.rootPath), { recursive: true });
  const client = new ImmudbClient({ host: cfg.host, port: cfg.port, rootPath: cfg.rootPath });
  await client.login({ user: cfg.user, password: cfg.password });
  await client.useDatabase({ databasename: cfg.database });
  return client;
}

/** Locate the single (uuid, db) trusted-state slot this client is tracking. */
function locateState(client: ImmuClient): { uuid: string; db: string; state: ImmuTrustedState } {
  const uuid = Object.keys(client.state.servers)[0];
  const db = Object.keys(client.state.servers[uuid])[0];
  return { uuid, db, state: client.state.servers[uuid][db] };
}

/**
 * Read immudb's current cryptographic root (the value we anchor externally).
 * We refresh via currentState() then read the Uint8Array txhash the client persisted.
 */
export async function readRoot(client: ImmuClient): Promise<ImmudbRoot> {
  await client.currentState();
  const { uuid, db, state } = locateState(client);
  return {
    db,
    serverUuid: uuid,
    txid: state.txid,
    txhashHex: Buffer.from(state.txhash).toString("hex"),
  };
}

/** Snapshot the current trusted state so a test can restore it after tampering. */
export function snapshotTrustedState(client: ImmuClient): ImmuTrustedState {
  const { state } = locateState(client);
  return { ...state, txhash: Uint8Array.from(state.txhash) };
}

/** Overwrite the locally-stored trusted root hash — simulates a forged/diverged anchor. */
export function forgeTrustedRoot(client: ImmuClient): void {
  const { state } = locateState(client);
  const forged = Uint8Array.from(state.txhash);
  forged[0] ^= 0xff;
  state.txhash = forged;
}

/** Restore a previously snapshotted trusted state. */
export function restoreTrustedState(client: ImmuClient, snap: ImmuTrustedState): void {
  const { uuid, db } = locateState(client);
  client.state.servers[uuid][db] = { ...snap, txhash: Uint8Array.from(snap.txhash) };
}

/** Seed a fresh client's trusted state to an externally-anchored root (auditor flow). */
export function seedTrustedRoot(client: ImmuClient, root: ImmudbRoot): void {
  client.state.servers[root.serverUuid] = {
    [root.db]: { db: root.db, txid: root.txid, txhash: Uint8Array.from(Buffer.from(root.txhashHex, "hex")) },
  };
}
