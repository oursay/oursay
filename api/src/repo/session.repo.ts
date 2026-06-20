// Data access for auth.sessions (opaque DB-backed tokens). Only token hashes are stored.

import type pg from "pg";

export interface SessionRecord {
  id: string;
  userId: string;
  scope: "full" | "recovery";
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export class SessionRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insert(s: {
    id: string;
    userId: string;
    tokenHash: string;
    scope: "full" | "recovery";
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.sessions (id, user_id, token_hash, scope, user_agent, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [s.id, s.userId, s.tokenHash, s.scope, s.userAgent, s.expiresAt],
    );
  }

  /** Active (not revoked, not expired) session for a presented token hash. */
  async getActiveByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, scope, user_agent, created_at, expires_at, revoked_at
         FROM auth.sessions
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
  }

  /** Revoke every active session for a user; returns the number revoked. */
  async revokeAllForUser(userId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return rowCount ?? 0;
  }

  async listByUserId(userId: string): Promise<SessionRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, scope, user_agent, created_at, expires_at, revoked_at
         FROM auth.sessions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(map);
  }
}

function map(r: any): SessionRecord {
  return {
    id: r.id,
    userId: r.user_id,
    scope: r.scope,
    userAgent: r.user_agent,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
    expiresAt: r.expires_at.toISOString?.() ?? String(r.expires_at),
    revokedAt: r.revoked_at ? (r.revoked_at.toISOString?.() ?? String(r.revoked_at)) : null,
  };
}
