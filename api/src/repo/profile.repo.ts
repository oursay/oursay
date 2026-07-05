// Data access for auth.profiles (private account PII). Lookups key on email_canonical.
// [code-over-18]: the age gate stores ONLY the self-attested over_18 boolean — no date of birth.
// `visibility` is the account-default author visibility (C4; effective value cascades
// thread ?? account ?? anonymous).

import type pg from "pg";

export type AccountVisibility = "anonymous" | "officials" | "my_district" | "public";

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
  over18: boolean;
  visibility: AccountVisibility;
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
  over18: boolean;
  visibility?: AccountVisibility;
  email: string;
  emailCanonical: string;
}

/** The PATCH-able private fields (A7). Absent = unchanged; explicit null clears a nullable field. */
export interface UpdateProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string;
  memo?: string | null;
}

export class ProfileRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insert(p: InsertProfileInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.profiles
         (user_id, first_name, last_name, address_line1, address_line2, city, province, postal_code,
          country, address_memo, over_18, visibility, email, email_canonical)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        p.userId, p.firstName, p.lastName, p.line1, p.line2, p.city, p.province, p.postalCode,
        p.country, p.memo, p.over18, p.visibility ?? "anonymous", p.email, p.emailCanonical,
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

  /** Partial update of the PATCH-able PII fields. Returns the updated row (null = no such profile). */
  async update(userId: string, patch: UpdateProfileInput): Promise<ProfileRecord | null> {
    const cols: string[] = [];
    const vals: unknown[] = [userId];
    const set = (col: string, v: unknown) => {
      vals.push(v);
      cols.push(`${col} = $${vals.length}`);
    };
    if (patch.firstName !== undefined) set("first_name", patch.firstName);
    if (patch.lastName !== undefined) set("last_name", patch.lastName);
    if (patch.line1 !== undefined) set("address_line1", patch.line1);
    if (patch.line2 !== undefined) set("address_line2", patch.line2);
    if (patch.city !== undefined) set("city", patch.city);
    if (patch.province !== undefined) set("province", patch.province);
    if (patch.postalCode !== undefined) set("postal_code", patch.postalCode);
    if (patch.country !== undefined) set("country", patch.country);
    if (patch.memo !== undefined) set("address_memo", patch.memo);
    if (cols.length === 0) return this.getByUserId(userId);
    const { rows } = await this.pool.query(
      `UPDATE auth.profiles SET ${cols.join(", ")} WHERE user_id = $1 RETURNING *`,
      vals,
    );
    return rows[0] ? map(rows[0]) : null;
  }

  /** The account-default author visibility (C4). */
  async setVisibility(userId: string, visibility: AccountVisibility): Promise<void> {
    await this.pool.query(`UPDATE auth.profiles SET visibility = $2 WHERE user_id = $1`, [userId, visibility]);
  }

  /** Optional per-jurisdiction visibility override layer (kept per docs/09; future MAY — no UI). */
  async setVisibilityOverride(userId: string, jurisdictionId: string, visibility: AccountVisibility | null): Promise<void> {
    if (visibility === null) {
      await this.pool.query(
        `DELETE FROM auth.visibility_overrides WHERE user_id = $1 AND jurisdiction_id = $2`,
        [userId, jurisdictionId],
      );
      return;
    }
    await this.pool.query(
      `INSERT INTO auth.visibility_overrides(user_id, jurisdiction_id, visibility) VALUES($1,$2,$3)
       ON CONFLICT (user_id, jurisdiction_id) DO UPDATE SET visibility = EXCLUDED.visibility`,
      [userId, jurisdictionId, visibility],
    );
  }

  async getVisibilityOverrides(userId: string): Promise<{ jurisdictionId: string; visibility: AccountVisibility }[]> {
    const { rows } = await this.pool.query(
      `SELECT jurisdiction_id, visibility FROM auth.visibility_overrides WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r) => ({ jurisdictionId: r.jurisdiction_id, visibility: r.visibility }));
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
    over18: r.over_18,
    visibility: r.visibility,
    email: r.email,
    emailCanonical: r.email_canonical,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
  };
}
