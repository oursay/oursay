import pg from "pg";
import type { PgConfig } from "./config.js";
import type { PrivateContent } from "./types.js";

/**
 * The PRIVATE, mutable store. Holds everything that must NOT be in the append-only
 * ledger: user PII, signing keys, and the raw content + salt behind each commitment.
 * Because it is mutable, redaction (withhold) and true erasure (delete) are possible
 * here — which is exactly why PII does not belong in immudb.
 */
export class PrivateStore {
  private pool: pg.Pool;

  constructor(cfg: PgConfig) {
    this.pool = new pg.Pool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      max: 4,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id        TEXT PRIMARY KEY,
        handle    TEXT NOT NULL,
        email     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS keys (
        id        TEXT PRIMARY KEY,
        user_id   TEXT NOT NULL,
        pubkey    TEXT NOT NULL,
        privkey   TEXT
      );
      CREATE TABLE IF NOT EXISTS raw_content (
        id          TEXT PRIMARY KEY,
        salt        TEXT,
        content     JSONB,
        redacted_at TIMESTAMPTZ,
        erased_at   TIMESTAMPTZ
      );
    `);
  }

  /** Wipe all private rows (test isolation). */
  async reset(): Promise<void> {
    await this.pool.query("TRUNCATE users, keys, raw_content");
  }

  async putUser(u: { id: string; handle: string; email?: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO users(id, handle, email) VALUES($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET handle=EXCLUDED.handle, email=EXCLUDED.email`,
      [u.id, u.handle, u.email ?? null],
    );
  }

  async putKey(k: { id: string; userId: string; pubkey: string; privkey?: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO keys(id, user_id, pubkey, privkey) VALUES($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET pubkey=EXCLUDED.pubkey, privkey=EXCLUDED.privkey`,
      [k.id, k.userId, k.pubkey, k.privkey ?? null],
    );
  }

  async putContent(c: { id: string; salt: string; content: unknown }): Promise<void> {
    await this.pool.query(
      `INSERT INTO raw_content(id, salt, content) VALUES($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET salt=EXCLUDED.salt, content=EXCLUDED.content`,
      [c.id, c.salt, JSON.stringify(c.content)],
    );
  }

  async getContent(id: string): Promise<PrivateContent | undefined> {
    const r = await this.pool.query(
      `SELECT id, salt, content, redacted_at, erased_at FROM raw_content WHERE id=$1`,
      [id],
    );
    if (r.rowCount === 0) return undefined;
    const row = r.rows[0];
    return {
      id: row.id,
      salt: row.salt,
      content: row.content,
      redactedAt: row.redacted_at ? new Date(row.redacted_at).toISOString() : null,
      erasedAt: row.erased_at ? new Date(row.erased_at).toISOString() : null,
    };
  }

  /**
   * REDACTION (Online Harms Act): stop distributing the plaintext publicly, but RETAIN
   * it privately for law enforcement. The ledger commitment is untouched.
   */
  async redact(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE raw_content SET redacted_at = now() WHERE id=$1 AND redacted_at IS NULL`,
      [id],
    );
  }

  /**
   * TRUE ERASURE (right-to-be-forgotten): physically destroy the plaintext + salt.
   * The row remains as a tombstone recording that erasure occurred; the content can
   * never be revealed or re-proved again. The ledger commitment survives as a tombstone.
   */
  async erase(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE raw_content SET content = NULL, salt = NULL, erased_at = now() WHERE id=$1`,
      [id],
    );
  }

  /** Whether content may be published (not redacted, not erased, still present). */
  async isRevealable(id: string): Promise<boolean> {
    const c = await this.getContent(id);
    return !!c && c.redactedAt === null && c.erasedAt === null && c.content != null && c.salt != null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
