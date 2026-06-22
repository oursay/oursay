// Data access for public.device_keys — the CIVIC signing device registry (docs/08 §5.4, Method 3).
//
// IMPORTANT: this is NOT auth.passkey_credentials. A civic device key signs public-record actions;
// an account-login passkey proves who is logged in. They are deliberately separate (different
// tables, different lifecycles). The platform stores the PUBLIC key only — a private key never
// reaches the server (docs/08 §6).
//
// The `device_keys` DDL is OWNED by @oursay/public-record (created by PrivateStore.init, which
// api/src/db.ts runs before the auth schema). This repo reads/writes it over the api's own pool, the
// same cross-schema pattern KycRepo uses for public.kyc_attestations. The write SQL mirrors
// PrivateStore.enrollDeviceKey/revokeDeviceKey (public-record/src/private/store.ts).

import { randomUUID } from "node:crypto";
import type pg from "pg";

export interface DeviceKeyRecord {
  id: string;
  userId: string;
  devicePubkey: string;
  label: string | null;
  enrolledAt: string;
  revokedAt: string | null;
}

export class CivicDeviceRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Enrol a public device key. Idempotent on device_pubkey (re-enroll clears prior revocation). */
  async enroll(input: { userId: string; devicePubkey: string; label?: string | null }): Promise<string> {
    const { rows } = await this.pool.query(
      `INSERT INTO device_keys(id, user_id, device_pubkey, label) VALUES($1,$2,$3,$4)
       ON CONFLICT (device_pubkey) DO UPDATE SET user_id = EXCLUDED.user_id, label = EXCLUDED.label, revoked_at = NULL
       RETURNING id`,
      [randomUUID(), input.userId, input.devicePubkey, input.label ?? null],
    );
    return rows[0].id as string;
  }

  /** A user's enrolled, non-revoked civic devices, oldest first. */
  async listActiveByUser(userId: string): Promise<DeviceKeyRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, device_pubkey, label, enrolled_at, revoked_at
         FROM device_keys WHERE user_id = $1 AND revoked_at IS NULL ORDER BY enrolled_at`,
      [userId],
    );
    return rows.map(map);
  }

  /** Resolve a device by its public key (to check ownership before revoking). */
  async getByPubkey(devicePubkey: string): Promise<DeviceKeyRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, device_pubkey, label, enrolled_at, revoked_at
         FROM device_keys WHERE device_pubkey = $1`,
      [devicePubkey],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  /** Revoke a device (lost/retired). Its thread-scoped signers stop being usable in public-record. */
  async revoke(devicePubkey: string): Promise<void> {
    await this.pool.query(
      `UPDATE device_keys SET revoked_at = now() WHERE device_pubkey = $1 AND revoked_at IS NULL`,
      [devicePubkey],
    );
  }
}

function map(r: any): DeviceKeyRecord {
  return {
    id: r.id,
    userId: r.user_id,
    devicePubkey: r.device_pubkey,
    label: r.label,
    enrolledAt: r.enrolled_at.toISOString?.() ?? String(r.enrolled_at),
    revokedAt: r.revoked_at ? (r.revoked_at.toISOString?.() ?? String(r.revoked_at)) : null,
  };
}
