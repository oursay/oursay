import pg from "pg";
import type { PgConfig } from "./config.js";
import { canonicalJson } from "./commitment.js";
import type { PublicEnvelope } from "./types.js";

/**
 * immudb 1.11.0 reached over the PostgreSQL wire protocol — the modern, maintained path
 * that "reaches up" to the latest server without the dead gRPC Node SDK.
 *
 * A plain node-postgres client writes envelopes (commitments only, same model as the
 * gRPC ledger) and calls immudb's built-in verification SQL functions:
 *   - immudb_state()                    -> current root (tx_id + tx_hash) to anchor
 *   - immudb_verify_row('table', pk)    -> cryptographic proof that a row is committed
 *   - immudb_verify_tx(tx_id)           -> verify a whole transaction
 *
 * Trust note: these functions run server-side, so this is a more server-trusting model
 * than a client computing proofs against an independently-held root. OurSay's zero-trust
 * layer therefore stays in the external Merkle anchoring + independent auditor, not here.
 *
 * Caveat: immudb speaks the pg WIRE protocol but not the full pg DIALECT. Use raw
 * parameterized queries (which DO work — extended protocol is supported); avoid tools
 * that introspect the catalog with Postgres-specific SQL.
 */

export interface ImmudbPgState {
  db: string;
  txId: number;
  txHashHex: string;
}

export interface RowVerification {
  verified: boolean;
  tableName: string;
  txId: number;
  revision: number;
}

const TABLE = "public_ledger";

export class ImmudbPgLedger {
  private client: pg.Client;
  readonly ids: string[] = [];

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
    await this.client.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
         id           VARCHAR[64],
         type         VARCHAR[16],
         author_ref   VARCHAR[128],
         created_at   VARCHAR[32],
         content_hash VARCHAR[64],
         envelope     VARCHAR[8192],
         PRIMARY KEY (id)
       )`,
    );
  }

  /** Write the public envelope (commitment only) as a verifiable immudb SQL row. */
  async appendEnvelope(envelope: PublicEnvelope): Promise<void> {
    await this.client.query(
      `INSERT INTO ${TABLE} (id, type, author_ref, created_at, content_hash, envelope)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        envelope.id,
        envelope.type,
        envelope.authorRef,
        envelope.createdAt,
        envelope.contentHash,
        canonicalJson(envelope),
      ],
    );
    this.ids.push(envelope.id);
  }

  async getEnvelope(id: string): Promise<PublicEnvelope | undefined> {
    // Two immudb pg-wire quirks handled here:
    //  1. No row count is reported for SELECT (node-postgres rowCount = 0 even with rows),
    //     so key off rows.length.
    //  2. Reusing the SAME parameterized SELECT rapidly on a long-lived connection can
    //     return a STALE prior result (portal/statement reuse). Using a literal query
    //     sidesteps it; pks are server-generated UUIDs, so interpolation is safe.
    const lit = id.replace(/'/g, "''");
    const r = await this.client.query(`SELECT envelope FROM ${TABLE} WHERE id = '${lit}'`);
    if (r.rows.length === 0) return undefined;
    return JSON.parse(r.rows[0].envelope) as PublicEnvelope;
  }

  /** immudb's current cryptographic root — the value to anchor externally. */
  async state(): Promise<ImmudbPgState> {
    const r = await this.client.query("SELECT immudb_state()");
    const row = r.rows[0];
    return { db: row.db, txId: Number(row.tx_id), txHashHex: row.tx_hash };
  }

  /**
   * Native server-side cryptographic verification of a single row by primary key.
   * NOTE: immudb does NOT accept an extended-protocol parameter as a function argument
   * (it yields "tbtree: key not found"); the pk must be a literal. We escape single
   * quotes — pks here are server-generated UUIDs, so this is safe.
   */
  async verifyRow(id: string): Promise<RowVerification> {
    const lit = id.replace(/'/g, "''");
    const r = await this.client.query(`SELECT immudb_verify_row('${TABLE}', '${lit}')`);
    const row = r.rows[0];
    return {
      verified: String(row.verified) === "true",
      tableName: row.table_name,
      txId: Number(row.tx_id),
      revision: Number(row.revision),
    };
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}
