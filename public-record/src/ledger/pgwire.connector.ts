import pg from "pg";
import type { PgConfig } from "../config.js";
import { dbNameForChain } from "../config.js";
import {
  BLOCKS_DDL,
  BLOCKS_TABLE,
  LEDGER_DDL,
  META_DDL,
  META_TABLE,
  TABLE,
} from "../schema/ledger.sql.js";
import type {
  BlockAttestation,
  BlockHeader,
  ChainRow,
  LedgerConnector,
  LedgerRoot,
  RowVerification,
} from "./connector.js";

export interface PgWireLedgerConnectorOptions {
  /** Instance host/user/password; `database` is ignored — this connector uses {@link dbNameForChain}. */
  instance: PgConfig;
  chainId: string;
  ledgerId: string;
  /** Optional fork lineage written once into ledger_meta. */
  fork?: {
    parentChainId: string;
    forkHeight: number;
    forkReason: string;
  };
}

/**
 * immudb 1.11.0 reached over the PostgreSQL wire protocol — the modern, maintained path
 * (FINDINGS §5). Bound to **one jurisdiction database** (snake_case of chainId) under the instance.
 *
 * pg-wire quirks handled (FINDINGS §5a): SELECT reports no rowCount (key off rows.length);
 * extended-protocol params do NOT bind as function arguments (pass literals to
 * immudb_verify_row); rapid reuse of the same parameterized SELECT can return a stale result
 * (use literal point reads). Parameterized INSERT works fine.
 *
 * Trust note: these functions run server-side, so verifyRow() is a more server-trusting check
 * than a client computing proofs against an independently-held root. OurSay's zero-trust layer
 * lives in the external anchoring + offline verifier (a later phase), not here.
 */
export class PgWireLedgerConnector implements LedgerConnector {
  readonly transport = "pgwire" as const;
  readonly chainId: string;
  readonly ledgerId: string;
  readonly databaseName: string;
  private readonly instance: PgConfig;
  private readonly fork?: PgWireLedgerConnectorOptions["fork"];
  private client: pg.Client | null = null;
  /** Serializes first connect so concurrent callers share one attempt (and failures clear cleanly). */
  private connectInflight: Promise<void> | null = null;

  constructor(opts: PgWireLedgerConnectorOptions) {
    this.instance = opts.instance;
    this.chainId = opts.chainId;
    this.ledgerId = opts.ledgerId;
    this.databaseName = dbNameForChain(opts.chainId);
    this.fork = opts.fork;
  }

  /** @deprecated Prefer {@link PgWireLedgerConnectorOptions}; kept for narrow test stubs. */
  static fromLegacyConfig(cfg: PgConfig, chainId: string, ledgerId: string): PgWireLedgerConnector {
    return new PgWireLedgerConnector({ instance: cfg, chainId, ledgerId });
  }

  private requireClient(): pg.Client {
    if (!this.client) throw new Error(`PgWireLedgerConnector(${this.chainId}): not connected`);
    return this.client;
  }

  private assertChain(chainId: string): void {
    if (chainId !== this.chainId) {
      throw new Error(
        `PgWireLedgerConnector bound to chain ${JSON.stringify(this.chainId)}; got ${JSON.stringify(chainId)}`,
      );
    }
  }

  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connectInflight) return this.connectInflight;
    this.connectInflight = this.connectOnce().finally(() => {
      this.connectInflight = null;
    });
    return this.connectInflight;
  }

  /**
   * Open the jurisdiction DB and finish genesis meta before publishing {@link client}.
   * On failure the client is closed and cleared so a later connect retries ensureMeta
   * (never skip a ledger_id mismatch after a half-ready first attempt).
   */
  private async connectOnce(): Promise<void> {
    if (this.client) return;
    await ensureDatabaseExists(this.instance, this.databaseName);
    const client = new pg.Client({
      host: this.instance.host,
      port: this.instance.port,
      user: this.instance.user,
      password: this.instance.password,
      database: this.databaseName,
    });
    await client.connect();
    // requireClient() needs this.client during DDL/meta; clear + close if anything fails.
    this.client = client;
    try {
      await client.query(LEDGER_DDL);
      await client.query(BLOCKS_DDL);
      await client.query(META_DDL);
      await this.ensureMeta();
    } catch (err) {
      this.client = null;
      await client.end().catch(() => {});
      throw err;
    }
  }

  /** Read ledger_meta value (undefined if absent). */
  async getMeta(key: string): Promise<string | undefined> {
    const lit = key.replace(/'/g, "''");
    const r = await this.requireClient().query(
      `SELECT meta_value FROM ${META_TABLE} WHERE meta_key = '${lit}'`,
    );
    return r.rows.length === 0 ? undefined : (r.rows[0].meta_value as string);
  }

  private async ensureMeta(): Promise<void> {
    const client = this.requireClient();
    await putMetaOnce(client, "ledger_id", this.ledgerId);
    await putMetaOnce(client, "chain_id", this.chainId);
    if (this.fork) {
      await putMetaOnce(client, "parent_chain_id", this.fork.parentChainId);
      await putMetaOnce(client, "fork_height", String(this.fork.forkHeight));
      await putMetaOnce(client, "fork_reason", this.fork.forkReason);
    }
  }

  async appendTx(chainId: string, row: ChainRow): Promise<void> {
    this.assertChain(chainId);
    // immudb dislikes NULLs in indexed VARCHAR columns; absent parent fields become "".
    await this.requireClient().query(
      `INSERT INTO ${TABLE}
        (tx_id, chain_id, type, entity_id, op, parent_type, parent_id, parent_revision_hash,
         author_pubkey, signature, created_at, prev_hash, content_hash, tx_hash, envelope)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        row.txId,
        chainId,
        row.type,
        row.entityId,
        row.op,
        row.parentType ?? "",
        row.parentId ?? "",
        row.parentRevisionHash ?? "",
        row.authorPubkey,
        row.signature,
        row.createdAt,
        row.prevHash ?? "",
        row.contentHash,
        row.txHash,
        row.envelope,
      ],
    );
  }

  async appendTxBatch(chainId: string, rows: ChainRow[]): Promise<void> {
    this.assertChain(chainId);
    // Idempotent: skip rows already on the chain (crash-after-batch / re-settle safety). The
    // getEnvelope guard is the fast path; immudb's tx_id PRIMARY KEY is the backstop.
    for (const row of rows) {
      if ((await this.getEnvelope(row.txId)) === undefined) await this.appendTx(chainId, row);
    }
  }

  async appendBlock(header: BlockHeader): Promise<void> {
    this.assertChain(header.chainId);
    // Idempotent on (chain_id, block_height): a header already at this height is a no-op, so a crash
    // between the tx batch and this insert (or a re-run) never double-writes / hits the PK.
    if ((await this.fetchBlockByHeight(header.chainId, header.blockHeight)) !== undefined) return;
    await this.requireClient().query(
      `INSERT INTO ${BLOCKS_TABLE}
        (chain_id, block_height, from_seq, to_seq, tx_count, bundle_merkle_root, chain_tip_hash,
         prev_block_root, prev_chain_tip_hash, immudb_db, immudb_tx_id, immudb_tx_hash,
         proposer, attestations, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        header.chainId,
        header.blockHeight,
        header.fromSeq,
        header.toSeq,
        header.txCount,
        header.bundleMerkleRoot,
        header.chainTipHash,
        header.prevBlockRoot ?? "", // immudb dislikes NULL in indexed cols; "" ↔ null on read
        header.prevChainTipHash ?? "",
        header.immudbRoot.db,
        header.immudbRoot.txId,
        header.immudbRoot.txHashHex,
        header.proposer ?? "", // reserved; "" ↔ null on read
        JSON.stringify(header.attestations ?? []), // reserved; JSON array, "[]" in stage 1
        header.capturedAt,
      ],
    );
  }

  async fetchLatestBlock(chainId: string): Promise<BlockHeader | undefined> {
    this.assertChain(chainId);
    // Literal point read (pg-wire stale-portal quirk); ORDER BY uses the (chain_id, block_height) PK.
    const lit = chainId.replace(/'/g, "''");
    const r = await this.requireClient().query(
      `SELECT * FROM ${BLOCKS_TABLE} WHERE chain_id = '${lit}' ORDER BY block_height DESC LIMIT 1`,
    );
    return r.rows.length === 0 ? undefined : mapBlockHeader(r.rows[0]);
  }

  async fetchBlockByHeight(chainId: string, blockHeight: number): Promise<BlockHeader | undefined> {
    this.assertChain(chainId);
    const lit = chainId.replace(/'/g, "''");
    const r = await this.requireClient().query(
      `SELECT * FROM ${BLOCKS_TABLE} WHERE chain_id = '${lit}' AND block_height = ${Number(blockHeight)}`,
    );
    return r.rows.length === 0 ? undefined : mapBlockHeader(r.rows[0]);
  }

  async healthcheck(): Promise<boolean> {
    try {
      if (!this.client) return false;
      await this.client.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async getEnvelope(txId: string): Promise<string | undefined> {
    // Literal point read: avoids the stale-portal and param-binding quirks. txIds are UUIDs.
    const lit = txId.replace(/'/g, "''");
    const r = await this.requireClient().query(`SELECT envelope FROM ${TABLE} WHERE tx_id = '${lit}'`);
    if (r.rows.length === 0) return undefined;
    return r.rows[0].envelope as string;
  }

  async state(): Promise<LedgerRoot> {
    const r = await this.requireClient().query("SELECT immudb_state()");
    const row = r.rows[0];
    // Some immudb builds return an empty `db` over pg-wire; fall back to the bound database name.
    const db = (row.db != null && String(row.db).length > 0 ? String(row.db) : this.databaseName);
    return { db, txId: Number(row.tx_id), txHashHex: row.tx_hash };
  }

  async verifyRow(txId: string): Promise<RowVerification> {
    // immudb does NOT accept an extended-protocol param as a function argument; pass a literal.
    const lit = txId.replace(/'/g, "''");
    const r = await this.requireClient().query(`SELECT immudb_verify_row('${TABLE}', '${lit}')`);
    const row = r.rows[0];
    return {
      verified: String(row.verified) === "true",
      txId: Number(row.tx_id),
      revision: Number(row.revision),
      provenance: "server",
    };
  }

  async close(): Promise<void> {
    if (!this.client) return;
    const c = this.client;
    this.client = null;
    await c.end();
  }
}

/** CREATE DATABASE if missing (from admin/bootstrap connection). Idempotent. */
export async function ensureDatabaseExists(instance: PgConfig, databaseName: string): Promise<void> {
  const admin = new pg.Client({
    host: instance.host,
    port: instance.port,
    user: instance.user,
    password: instance.password,
    database: instance.database || "defaultdb",
  });
  await admin.connect();
  try {
    const lit = databaseName.replace(/'/g, "''");
    try {
      await admin.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Already exists — tolerate. Exact wording varies across immudb versions.
      if (!/already exists|exist|duplicate/i.test(msg)) throw err;
    }
    void lit;
  } finally {
    await admin.end();
  }
}

/**
 * Drop/unload a jurisdiction database. Tries SQL DROP DATABASE; immudb may require immuadmin unload —
 * callers catch and fall back. Destructive: assertDestructiveAllowed before calling.
 */
export async function dropDatabase(instance: PgConfig, databaseName: string): Promise<"dropped" | "unsupported"> {
  const admin = new pg.Client({
    host: instance.host,
    port: instance.port,
    user: instance.user,
    password: instance.password,
    database: instance.database || "defaultdb",
  });
  await admin.connect();
  try {
    try {
      await admin.query(`DROP DATABASE ${quoteIdent(databaseName)}`);
      return "dropped";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/does not exist|not exist|not found/i.test(msg)) return "dropped";
      if (/not supported|unsupported|syntax|unknown/i.test(msg)) return "unsupported";
      throw err;
    }
  } finally {
    await admin.end();
  }
}

/** List application databases (best-effort via pg_database; excludes system DBs). */
export async function listImmudbDatabases(instance: PgConfig): Promise<string[]> {
  const admin = new pg.Client({
    host: instance.host,
    port: instance.port,
    user: instance.user,
    password: instance.password,
    database: instance.database || "defaultdb",
  });
  await admin.connect();
  try {
    try {
      const r = await admin.query(
        `SELECT datname FROM pg_database WHERE datname NOT IN ('defaultdb','systemdb','sysdb')`,
      );
      return r.rows.map((row) => String(row.datname));
    } catch {
      return [];
    }
  } finally {
    await admin.end();
  }
}

function quoteIdent(name: string): string {
  // Always `j_` + snake_case — safe unquoted identifier.
  if (!/^j_[a-z0-9_]+$/.test(name)) {
    throw new Error(`invalid immudb database name: ${JSON.stringify(name)}`);
  }
  return name;
}

async function putMetaOnce(client: pg.Client, key: string, value: string): Promise<void> {
  const existing = await client.query(
    `SELECT meta_value FROM ${META_TABLE} WHERE meta_key = '${key.replace(/'/g, "''")}'`,
  );
  if (existing.rows.length > 0) {
    const prev = String(existing.rows[0].meta_value);
    if (prev !== value) {
      throw new Error(
        `ledger_meta ${key} mismatch: on-chain ${JSON.stringify(prev)} vs config ${JSON.stringify(value)}`,
      );
    }
    return;
  }
  await client.query(`INSERT INTO ${META_TABLE} (meta_key, meta_value) VALUES ($1,$2)`, [key, value]);
}

/** Map a record_blocks row to a BlockHeader: "" prev/proposer fields ↔ null; numerics coerced. */
function mapBlockHeader(row: pg.QueryResultRow): BlockHeader {
  const orNull = (v: unknown): string | null => (v == null || v === "" ? null : (v as string));
  let attestations: BlockAttestation[] = [];
  try {
    if (row.attestations) attestations = JSON.parse(row.attestations as string) as BlockAttestation[];
  } catch {
    attestations = [];
  }
  return {
    chainId: row.chain_id,
    blockHeight: Number(row.block_height),
    fromSeq: Number(row.from_seq),
    toSeq: Number(row.to_seq),
    txCount: Number(row.tx_count),
    bundleMerkleRoot: row.bundle_merkle_root,
    chainTipHash: row.chain_tip_hash,
    prevBlockRoot: orNull(row.prev_block_root),
    prevChainTipHash: orNull(row.prev_chain_tip_hash),
    immudbRoot: { db: row.immudb_db, txId: Number(row.immudb_tx_id), txHashHex: row.immudb_tx_hash },
    proposer: orNull(row.proposer),
    attestations,
    capturedAt: row.captured_at,
  };
}
