// Data access for public.users (shared with @oursay/public-record). @oursay/api owns account
// creation at registration. `handle` is the REQUIRED unique @username and `display_name` the public
// display text (falls back to the handle without its '@') — both NOT NULL ([align-w3-gates-schema],
// C4). Non-indexable presentation (bio, icon_type) lives in profile_details JSONB. Legal name is
// private PII on auth.profiles, never here. Parametrized SQL only — no business rules.

import type pg from "pg";
import { displayNameFor, normalizeHandle, requireValidHandle } from "../helpers/handle.js";
import { normalizeUserIconType, type UserIconType } from "../helpers/icon-type.js";

export interface UserProfileDetails {
  bio?: string;
  icon_type?: string;
}

export interface UserRecord {
  id: string;
  handle: string;
  /** Public display name: stored display_name (falls back to handle without its '@' at write time). */
  displayName: string;
  /** Flat bio from profile_details (defaults to ""). */
  bio: string;
  /** DiceBear style for user profiles (allowlist; default thumbs). */
  iconType: UserIconType;
  /** Raw profile_details blob (for merge writes). */
  profileDetails: UserProfileDetails;
  createdAt: string;
}

const BIO_MAX = 280;
const DISPLAY_NAME_MAX = 80;

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
      `SELECT id, handle, display_name, profile_details, created_at FROM public.users WHERE id = $1`,
      [id],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async getByHandle(handle: string): Promise<UserRecord | null> {
    const wire = normalizeHandle(handle);
    if (!wire) return null;
    const { rows } = await this.pool.query(
      `SELECT id, handle, display_name, profile_details, created_at FROM public.users WHERE handle = $1`,
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
    const trimmed = displayName.trim().slice(0, DISPLAY_NAME_MAX);
    await this.pool.query(`UPDATE public.users SET display_name = $2 WHERE id = $1`, [id, trimmed]);
  }

  /**
   * Merge `bio` into profile_details without wiping other keys (e.g. icon_type).
   * Empty/whitespace clears to "".
   */
  async setBio(id: string, bio: string): Promise<void> {
    const value = bio.trim().slice(0, BIO_MAX);
    await this.pool.query(
      `UPDATE public.users
       SET profile_details = jsonb_set(
         COALESCE(profile_details, '{}'::jsonb),
         '{bio}',
         to_jsonb($2::text),
         true
       )
       WHERE id = $1`,
      [id, value],
    );
  }

  /** Merge `icon_type` into profile_details without wiping bio. Caller must pass an allowlisted value. */
  async setIconType(id: string, iconType: UserIconType): Promise<void> {
    await this.pool.query(
      `UPDATE public.users
       SET profile_details = jsonb_set(
         COALESCE(profile_details, '{}'::jsonb),
         '{icon_type}',
         to_jsonb($2::text),
         true
       )
       WHERE id = $1`,
      [id, iconType],
    );
  }

  /** Remove an account row (used to roll back a half-built registration). */
  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM public.users WHERE id = $1`, [id]);
  }
}

export { BIO_MAX, DISPLAY_NAME_MAX };

function map(r: any): UserRecord {
  const details = parseDetails(r.profile_details);
  return {
    id: r.id,
    handle: r.handle,
    displayName: displayNameFor(r.handle, r.display_name) ?? r.handle,
    bio: typeof details.bio === "string" ? details.bio : "",
    iconType: normalizeUserIconType(details.icon_type),
    profileDetails: details,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
  };
}

function parseDetails(raw: unknown): UserProfileDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: UserProfileDetails = {};
  if (typeof o.bio === "string") out.bio = o.bio;
  if (typeof o.icon_type === "string") out.icon_type = o.icon_type;
  return out;
}
