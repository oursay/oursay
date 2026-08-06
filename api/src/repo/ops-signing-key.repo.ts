// Data access for auth.ops_signing_keys — soft P-256 keys enrolled for headless platform-ops admin
// attestations (CLI). Lookup by pubkey_hex so submit can resolve key → user → admin role.

import type pg from "pg";

export interface OpsSigningKeyRecord {
  id: string;
  userId: string;
  pubkeyHex: string;
  label: string | null;
  createdAt: string;
}

export class OpsSigningKeyRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insert(k: {
    id: string;
    userId: string;
    pubkeyHex: string;
    label: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.ops_signing_keys (id, user_id, pubkey_hex, label)
       VALUES ($1,$2,$3,$4)`,
      [k.id, k.userId, k.pubkeyHex.toLowerCase(), k.label],
    );
  }

  async getByPubkeyHex(pubkeyHex: string): Promise<OpsSigningKeyRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.ops_signing_keys WHERE pubkey_hex = $1`,
      [pubkeyHex.toLowerCase()],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async listByUserId(userId: string): Promise<OpsSigningKeyRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.ops_signing_keys WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return rows.map(map);
  }
}

function map(r: any): OpsSigningKeyRecord {
  return {
    id: r.id,
    userId: r.user_id,
    pubkeyHex: r.pubkey_hex,
    label: r.label,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
  };
}
