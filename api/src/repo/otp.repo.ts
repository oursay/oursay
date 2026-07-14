// Data access for auth.email_otp. Codes are stored hashed; this layer never sees plaintext.
// Registration rows may carry reserved_handle + profile_json for cross-session verify.

import type pg from "pg";

export type OtpPurpose = "registration" | "recovery" | "login";

/** Profile snapshot stored on a registration OTP at request time. */
export interface RegistrationOtpDraft {
  handle: string;
  over18: boolean;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    country?: string | null;
    memo?: string | null;
  };
}

export interface OtpRecord {
  id: string;
  emailCanonical: string;
  codeHash: string;
  salt: string;
  purpose: OtpPurpose;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  reservedHandle: string | null;
  profileJson: RegistrationOtpDraft | null;
}

export class OtpRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insert(o: {
    id: string;
    emailCanonical: string;
    codeHash: string;
    salt: string;
    purpose: OtpPurpose;
    expiresAt: Date;
    reservedHandle?: string | null;
    profileJson?: RegistrationOtpDraft | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.email_otp
         (id, email_canonical, code_hash, salt, purpose, expires_at, reserved_handle, profile_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        o.id,
        o.emailCanonical,
        o.codeHash,
        o.salt,
        o.purpose,
        o.expiresAt,
        o.reservedHandle ?? null,
        o.profileJson ? JSON.stringify(o.profileJson) : null,
      ],
    );
  }

  /** Invalidate any outstanding codes for this (email, purpose) before issuing a fresh one. */
  async consumeOutstanding(emailCanonical: string, purpose: OtpPurpose): Promise<void> {
    await this.pool.query(
      `UPDATE auth.email_otp SET consumed_at = now()
        WHERE email_canonical = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [emailCanonical, purpose],
    );
  }

  /** Release expired unconsumed registration holds so their handles can be claimed again. */
  async consumeExpiredRegistrationHolds(): Promise<void> {
    await this.pool.query(
      `UPDATE auth.email_otp SET consumed_at = now()
        WHERE purpose = 'registration'
          AND consumed_at IS NULL
          AND expires_at <= now()`,
    );
  }

  /**
   * Email that currently holds this handle via an active (unconsumed, unexpired) registration OTP.
   * Null if the handle is free to reserve.
   */
  async getActiveRegistrationHolder(reservedHandle: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      `SELECT email_canonical FROM auth.email_otp
        WHERE reserved_handle = $1
          AND purpose = 'registration'
          AND consumed_at IS NULL
          AND expires_at > now()
        LIMIT 1`,
      [reservedHandle],
    );
    return rows[0] ? String(rows[0].email_canonical) : null;
  }

  /** Latest active (unconsumed, unexpired) code for a (email, purpose). */
  async getLatestActive(emailCanonical: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.email_otp
        WHERE email_canonical = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1`,
      [emailCanonical, purpose],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  /** Increment the attempt counter and return the new value. */
  async incrementAttempts(id: string): Promise<number> {
    const { rows } = await this.pool.query(
      `UPDATE auth.email_otp SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
      [id],
    );
    return rows[0] ? Number(rows[0].attempts) : 0;
  }

  async consume(id: string): Promise<void> {
    await this.pool.query(`UPDATE auth.email_otp SET consumed_at = now() WHERE id = $1`, [id]);
  }
}

function mapProfileJson(raw: unknown): RegistrationOtpDraft | null {
  if (raw == null) return null;
  const obj = typeof raw === "string" ? (JSON.parse(raw) as RegistrationOtpDraft) : (raw as RegistrationOtpDraft);
  if (!obj || typeof obj.handle !== "string" || typeof obj.over18 !== "boolean") return null;
  return obj;
}

function map(r: any): OtpRecord {
  return {
    id: r.id,
    emailCanonical: r.email_canonical,
    codeHash: r.code_hash,
    salt: r.salt,
    purpose: r.purpose,
    attempts: Number(r.attempts),
    expiresAt: r.expires_at.toISOString?.() ?? String(r.expires_at),
    consumedAt: r.consumed_at ? (r.consumed_at.toISOString?.() ?? String(r.consumed_at)) : null,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
    reservedHandle: r.reserved_handle ? String(r.reserved_handle) : null,
    profileJson: mapProfileJson(r.profile_json),
  };
}
