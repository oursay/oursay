// Data access for public.users (shared with @oursay/public-record). @oursay/api owns account
// creation at registration. `handle` is the REQUIRED unique @username and `display_name` the public
// display text (falls back to the handle without its '@') — both NOT NULL ([align-w3-gates-schema],
// C4). The user's legal name is private PII and lives in auth.profiles, never here. Parametrized SQL
// only — no business rules.

import type pg from "pg";
import { displayNameFor, normalizeHandle, requireValidHandle } from "../helpers/handle.js";

export interface UserRecord {
  id: string;
  handle: string;
  /** Public display name: stored display_name (falls back to handle without its '@' at write time). */
  displayName: string;
  createdAt: string;
}

export class UserRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Insert a new account row. Caller supplies the UUID so IDs stay consistent across services.
   *  `displayName` falls back to the handle without its '@' (display_name is NOT NULL). */
  async create(u: { id: string; handle: string; displayName?: string | null }): Promise<void> {
    const handle = requireValidHandle(u.handle);
    const displayName = u.displayName?.trim() || handle.replace(/^@/, "");
    await this.pool.query(
      `INSERT INTO public.users (id, handle, display_name) VALUES ($1, $2, $3)`,
      [u.id, handle, displayName],
    );
  }

  async getById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, handle, display_name, created_at FROM public.users WHERE id = $1`,
      [id],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async getByHandle(handle: string): Promise<UserRecord | null> {
    const wire = normalizeHandle(handle);
    if (!wire) return null;
    const { rows } = await this.pool.query(
      `SELECT id, handle, display_name, created_at FROM public.users WHERE handle = $1`,
      [wire],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  /** Is this username already taken (by a different account)? Accepts wire or @-prefixed input. */
  async handleExists(handle: string): Promise<boolean> {
    const wire = normalizeHandle(handle);
    if (!wire) return false;
    const { rows } = await this.pool.query(`SELECT 1 FROM public.users WHERE handle = $1`, [wire]);
    return rows.length > 0;
  }

  async setHandle(id: string, handle: string): Promise<void> {
    await this.pool.query(`UPDATE public.users SET handle = $2 WHERE id = $1`, [
      id,
      requireValidHandle(handle),
    ]);
  }

  async setDisplayName(id: string, displayName: string): Promise<void> {
    await this.pool.query(`UPDATE public.users SET display_name = $2 WHERE id = $1`, [id, displayName]);
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
    displayName: displayNameFor(r.handle, r.display_name) ?? r.handle,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
  };
}
