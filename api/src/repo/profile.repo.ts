// Data access for auth.profiles (private account PII). Lookups key on email_canonical.

import type pg from "pg";

export interface ProfileRecord {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  memo: string | null;
  birthdate: string; // YYYY-MM-DD
  email: string;
  emailCanonical: string;
  createdAt: string;
}

export interface InsertProfileInput {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  memo: string | null;
  birthdate: string; // YYYY-MM-DD
  email: string;
  emailCanonical: string;
}

export class ProfileRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insert(p: InsertProfileInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.profiles
         (user_id, first_name, last_name, address_line1, address_line2, city, province, postal_code,
          country, address_memo, birthdate, email, email_canonical)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        p.userId, p.firstName, p.lastName, p.line1, p.line2, p.city, p.province, p.postalCode,
        p.country, p.memo, p.birthdate, p.email, p.emailCanonical,
      ],
    );
  }

  async getByUserId(userId: string): Promise<ProfileRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM auth.profiles WHERE user_id = $1`, [userId]);
    return rows[0] ? map(rows[0]) : null;
  }

  async getByEmailCanonical(emailCanonical: string): Promise<ProfileRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.profiles WHERE email_canonical = $1`,
      [emailCanonical],
    );
    return rows[0] ? map(rows[0]) : null;
  }
}

function map(r: any): ProfileRecord {
  return {
    userId: r.user_id,
    firstName: r.first_name,
    lastName: r.last_name,
    line1: r.address_line1,
    line2: r.address_line2,
    city: r.city,
    province: r.province,
    postalCode: r.postal_code,
    country: r.country,
    memo: r.address_memo,
    birthdate: typeof r.birthdate === "string" ? r.birthdate : toYmd(r.birthdate),
    email: r.email,
    emailCanonical: r.email_canonical,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
  };
}

function toYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
