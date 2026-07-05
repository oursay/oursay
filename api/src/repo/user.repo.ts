// Data access for public.users (shared with @oursay/public-record). @oursay/api owns account
// creation at registration. `handle` is an optional unique @username and `display_name` an optional
// public display; both stay NULL until a user opts into a public profile. The user's legal name is
// private PII and lives in auth.profiles, never here. Parametrized SQL only — no business rules.

import type pg from "pg";
import { displayNameFor } from "../helpers/handle.js";

export interface UserRecord {
  id: string;
  handle: string | null;
  /** Effective public display name: stored display_name, else handle without its '@', else null. */
  displayName: string | null;
  createdAt: string;
}

export class UserRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Insert a new account row. Caller supplies the UUID so IDs stay consistent across services. */
  async create(u: { id: string; handle?: string | null; displayName?: string | null }): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.users (id, handle, display_name) VALUES ($1, $2, $3)`,
      [u.id, u.handle ?? null, u.displayName ?? null],
    );
  }

  async getById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, handle, display_name, created_at FROM public.users WHERE id = $1`,
      [id],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  /** Is this @username already taken (by a different account)? */
  async handleExists(handle: string): Promise<boolean> {
    const { rows } = await this.pool.query(`SELECT 1 FROM public.users WHERE handle = $1`, [handle]);
    return rows.length > 0;
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
  return {
    id: r.id,
    handle: r.handle,
    displayName: displayNameFor(r.handle, r.display_name),
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
  };
}
