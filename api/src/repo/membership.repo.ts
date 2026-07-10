// Data access for auth.jurisdiction_memberships ([mvp-c10b-membership]): jurisdiction
// subscriptions + the platform-assigned official ROLE (never a KYC tier — Part 5 #7). An official's
// in-district logic keys on represented_district_slug, never the home address (Part 6 #5).

import type pg from "pg";

export interface MembershipRecord {
  userId: string;
  jurisdictionId: string;
  role: "official" | null;
  representedDistrictSlug: string | null;
  createdAt: string;
}

export class MembershipRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Subscribe a user to a jurisdiction (idempotent; never clobbers an assigned role). */
  async add(userId: string, jurisdictionId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.jurisdiction_memberships(user_id, jurisdiction_id) VALUES($1,$2)
       ON CONFLICT (user_id, jurisdiction_id) DO NOTHING`,
      [userId, jurisdictionId],
    );
  }

  async remove(userId: string, jurisdictionId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM auth.jurisdiction_memberships WHERE user_id = $1 AND jurisdiction_id = $2`,
      [userId, jurisdictionId],
    );
  }

  async listForUser(userId: string): Promise<MembershipRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.jurisdiction_memberships WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return rows.map(map);
  }

  async get(userId: string, jurisdictionId: string): Promise<MembershipRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.jurisdiction_memberships WHERE user_id = $1 AND jurisdiction_id = $2`,
      [userId, jurisdictionId],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  /** Whether the user holds the official role in the jurisdiction (the {role:"official"} gate). */
  async hasRole(userId: string, jurisdictionId: string, role: "official"): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM auth.jurisdiction_memberships
       WHERE user_id = $1 AND jurisdiction_id = $2 AND role = $3`,
      [userId, jurisdictionId, role],
    );
    return rows.length > 0;
  }

  /** Assign (or revoke with null) the official role. Ensures the membership row exists first —
   *  a role implies membership. Platform-only operation (manual validation; Part 6 #5). */
  async setRole(
    userId: string,
    jurisdictionId: string,
    role: "official" | null,
    representedDistrictSlug: string | null = null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.jurisdiction_memberships(user_id, jurisdiction_id, role, represented_district_slug)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (user_id, jurisdiction_id) DO UPDATE SET
         role = EXCLUDED.role, represented_district_slug = EXCLUDED.represented_district_slug`,
      [userId, jurisdictionId, role, role === null ? null : representedDistrictSlug],
    );
  }

  /** All official-role holders in a jurisdiction (officials-affected visibility + count exclusion). */
  async officialsIn(jurisdictionId: string): Promise<MembershipRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.jurisdiction_memberships WHERE jurisdiction_id = $1 AND role = 'official'`,
      [jurisdictionId],
    );
    return rows.map(map);
  }
}

function map(r: any): MembershipRecord {
  return {
    userId: r.user_id,
    jurisdictionId: r.jurisdiction_id,
    role: r.role,
    representedDistrictSlug: r.represented_district_slug,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
  };
}
