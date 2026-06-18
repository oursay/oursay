import pg from "pg";
import type { PgConfig } from "../config.js";
import { BLOCKS_DDL, BLOCKS_TABLE, LEDGER_DDL, TABLE } from "../schema/ledger.sql.js";
import type { BlockHeader, ChainRow, LedgerConnector, LedgerRoot, RowVerification } from "./connector.js";

/**
 * immudb 1.11.0 reached over the PostgreSQL wire protocol — the modern, maintained path
 * (FINDINGS §5). A plain `pg` client writes commitment rows and calls immudb's built-in
 * verification SQL functions (immudb_state(), immudb_verify_row()).
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
  private client: pg.Client;

  constructor(cfg: PgConfig) {
    this.client = new pg.Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.client.query(LEDGER_DDL);
    await this.client.query(BLOCKS_DDL);
  }

  async appendTx(row: ChainRow): Promise<void> {
    // immudb dislikes NULLs in indexed VARCHAR columns; absent parent fields become "".
    await this.client.query(
      `INSERT INTO ${TABLE}
        (tx_id, type, entity_id, op, parent_type, parent_id, parent_revision_hash,
         author_pubkey, signature, created_at, prev_hash, content_hash, tx_hash, envelope)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        row.txId,
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

  async appendTxBatch(rows: ChainRow[]): Promise<void> {
    // Idempotent: skip rows already on the chain (crash-after-batch / re-settle safety). The
    // getEnvelope guard is the fast path; immudb's tx_id PRIMARY KEY is the backstop.
    for (const row of rows) {
      if ((await this.getEnvelope(row.txId)) === undefined) await this.appendTx(row);
    }
  }

  async appendBlock(header: BlockHeader): Promise<void> {
    // Idempotent on (chain_id, block_height): a header already at this height is a no-op, so a crash
    // between the tx batch and this insert (or a re-run) never double-writes / hits the PK.
    if ((await this.fetchBlockByHeight(header.chainId, header.blockHeight)) !== undefined) return;
    await this.client.query(
      `INSERT INTO ${BLOCKS_TABLE}
        (chain_id, block_height, from_seq, to_seq, tx_count, bundle_merkle_root, chain_tip_hash,
         prev_block_root, prev_chain_tip_hash, immudb_db, immudb_tx_id, immudb_tx_hash, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
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
        header.capturedAt,
      ],
    );
  }

  async fetchLatestBlock(chainId: string): Promise<BlockHeader | undefined> {
    // Literal point read (pg-wire stale-portal quirk); ORDER BY uses the (chain_id, block_height) PK.
    const lit = chainId.replace(/'/g, "''");
    const r = await this.client.query(
      `SELECT * FROM ${BLOCKS_TABLE} WHERE chain_id = '${lit}' ORDER BY block_height DESC LIMIT 1`,
    );
    return r.rows.length === 0 ? undefined : mapBlockHeader(r.rows[0]);
  }

  async fetchBlockByHeight(chainId: string, blockHeight: number): Promise<BlockHeader | undefined> {
    const lit = chainId.replace(/'/g, "''");
    const r = await this.client.query(
      `SELECT * FROM ${BLOCKS_TABLE} WHERE chain_id = '${lit}' AND block_height = ${Number(blockHeight)}`,
    );
    return r.rows.length === 0 ? undefined : mapBlockHeader(r.rows[0]);
  }

  async healthcheck(): Promise<boolean> {
    try {
      await this.client.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async getEnvelope(txId: string): Promise<string | undefined> {
    // Literal point read: avoids the stale-portal and param-binding quirks. txIds are UUIDs.
    const lit = txId.replace(/'/g, "''");
    const r = await this.client.query(`SELECT envelope FROM ${TABLE} WHERE tx_id = '${lit}'`);
    if (r.rows.length === 0) return undefined;
    return r.rows[0].envelope as string;
  }

  async state(): Promise<LedgerRoot> {
    const r = await this.client.query("SELECT immudb_state()");
    const row = r.rows[0];
    return { db: row.db, txId: Number(row.tx_id), txHashHex: row.tx_hash };
  }

  async verifyRow(txId: string): Promise<RowVerification> {
    // immudb does NOT accept an extended-protocol param as a function argument; pass a literal.
    const lit = txId.replace(/'/g, "''");
    const r = await this.client.query(`SELECT immudb_verify_row('${TABLE}', '${lit}')`);
    const row = r.rows[0];
    return {
      verified: String(row.verified) === "true",
      txId: Number(row.tx_id),
      revision: Number(row.revision),
      provenance: "server",
    };
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}

/** Map a record_blocks row to a BlockHeader: "" prev fields ↔ null; numerics coerced. */
function mapBlockHeader(row: pg.QueryResultRow): BlockHeader {
  const orNull = (v: unknown): string | null => (v == null || v === "" ? null : (v as string));
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
    capturedAt: row.captured_at,
  };
}
