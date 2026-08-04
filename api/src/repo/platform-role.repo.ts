// Data access for auth.account_roles ([v1-a-admin-role]): platform-scoped roles (admin today;
// anticipated: dev, mod, auditor, support — CHECK-listed only; no behavior beyond admin yet).
// Orthogonal to KYC tiers and to jurisdiction Official on auth.jurisdiction_memberships.

import type pg from "pg";

/** Platform roles with shipped or anticipated CHECK values. Only `admin` is used in product today. */
export type PlatformRole = "admin" | "dev" | "mod" | "auditor" | "support";

export interface PlatformRoleRecord {
  userId: string;
  role: PlatformRole;
  grantedByAdminId: string | null;
  grantedAt: string;
}

export class PlatformRoleRepo {
  constructor(private readonly pool: pg.Pool) {}

  async hasRole(userId: string, role: PlatformRole): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM auth.account_roles WHERE user_id = $1 AND role = $2`,
      [userId, role],
    );
    return rows.length > 0;
  }

  /** Idempotent grant — ON CONFLICT DO NOTHING preserves the original audit columns. */
  async grant(
    userId: string,
    role: PlatformRole,
    grantedByAdminId: string | null = null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.account_roles(user_id, role, granted_by_admin_id)
       VALUES($1,$2,$3)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, role, grantedByAdminId],
    );
  }

  /** Idempotent revoke — deleting a missing row is a no-op. */
  async revoke(userId: string, role: PlatformRole): Promise<void> {
    await this.pool.query(
      `DELETE FROM auth.account_roles WHERE user_id = $1 AND role = $2`,
      [userId, role],
    );
  }

  async listRoles(userId: string): Promise<PlatformRole[]> {
    const { rows } = await this.pool.query(
      `SELECT role FROM auth.account_roles WHERE user_id = $1 ORDER BY role`,
      [userId],
    );
    return rows.map((r) => r.role as PlatformRole);
  }

  async listAdmins(): Promise<PlatformRoleRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.account_roles WHERE role = 'admin' ORDER BY granted_at`,
    );
    return rows.map(map);
  }

  async countAdmins(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM auth.account_roles WHERE role = 'admin'`,
    );
    return rows[0]?.n ?? 0;
  }
}

function map(r: any): PlatformRoleRecord {
  return {
    userId: r.user_id,
    role: r.role,
    grantedByAdminId: r.granted_by_admin_id,
    grantedAt: r.granted_at.toISOString?.() ?? String(r.granted_at),
  };
}
