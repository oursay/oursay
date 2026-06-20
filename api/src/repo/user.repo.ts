// Data access for public.users (shared with @oursay/public-record). @oursay/api owns account
// creation at registration and writes the display name to users.handle (the single source of truth).
// Parametrized SQL only — no business rules.

import type pg from "pg";

export interface UserRecord {
  id: string;
  handle: string | null;
  createdAt: string;
}

export class UserRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Insert a new account row. Caller supplies the UUID so IDs stay consistent across services. */
  async create(u: { id: string; handle: string | null }): Promise<void> {
    await this.pool.query(`INSERT INTO public.users (id, handle) VALUES ($1, $2)`, [u.id, u.handle]);
  }

  async getById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, handle, created_at FROM public.users WHERE id = $1`,
      [id],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async setHandle(id: string, handle: string | null): Promise<void> {
    await this.pool.query(`UPDATE public.users SET handle = $2 WHERE id = $1`, [id, handle]);
  }

  /** Remove an account row (used to roll back a half-built registration). */
  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM public.users WHERE id = $1`, [id]);
  }
}

function map(r: any): UserRecord {
  return { id: r.id, handle: r.handle, createdAt: r.created_at.toISOString?.() ?? String(r.created_at) };
}
