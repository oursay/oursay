import pg from "pg";
import type { PgConfig } from "../config.js";
import { LEDGER_DDL, TABLE } from "../schema/ledger.sql.js";
import type { ChainRow, LedgerConnector, LedgerRoot, RowVerification } from "./connector.js";

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
