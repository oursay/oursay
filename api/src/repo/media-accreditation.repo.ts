// Data access for auth.media_accreditations ([v1-media-accreditations]): user-held press credentials.
// Media mark = ≥1 valid row; mediaAccredited(J) = valid body_id ∈ J.recognizedAccreditationBodyIds.

import { randomUUID } from "node:crypto";
import type pg from "pg";
import { ServiceError } from "../errors.js";
import { assertAccreditationBodyId } from "./accreditation-body.repo.js";

export interface MediaAccreditationRecord {
  id: string;
  userId: string;
  accreditationBodyId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  grantedAt: string;
  grantedByAdminId: string | null;
  note: string | null;
}

export class MediaAccreditationRepo {
  constructor(private readonly pool: pg.Pool) {}

  async getById(id: string): Promise<MediaAccreditationRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM auth.media_accreditations WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? map(rows[0]) : null;
  }

  async listForUser(userId: string): Promise<MediaAccreditationRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.media_accreditations WHERE user_id = $1 ORDER BY granted_at DESC`,
      [userId],
    );
    return rows.map(map);
  }

  /** Valid = not revoked AND (expires_at IS NULL OR expires_at > now). */
  async listValidBodyIds(userId: string, asOf: Date = new Date()): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT DISTINCT accreditation_body_id
         FROM auth.media_accreditations
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > $2)
        ORDER BY accreditation_body_id`,
      [userId, asOf],
    );
    return rows.map((r) => r.accreditation_body_id as string);
  }

  async hasMediaMark(userId: string, asOf: Date = new Date()): Promise<boolean> {
    const bodies = await this.listValidBodyIds(userId, asOf);
    return bodies.length > 0;
  }

  /**
   * Grant accreditation. Body must exist and be `active`. Does not refuse duplicate body rows
   * (history may keep revoked/expired grants); prefer one active row per body in ops practice.
   */
  async grant(input: {
    userId: string;
    accreditationBodyId: string;
    grantedByAdminId: string | null;
    expiresAt?: Date | null;
    note?: string | null;
  }): Promise<MediaAccreditationRecord> {
    const bodyId = assertAccreditationBodyId(input.accreditationBodyId);
    const { rows: bodies } = await this.pool.query(
      `SELECT id, status FROM auth.accreditation_bodies WHERE id = $1`,
      [bodyId],
    );
    if (!bodies[0]) {
      throw new ServiceError("not_found", `accreditation body not found: ${bodyId}`);
    }
    if (bodies[0].status !== "active") {
      throw new ServiceError(
        "conflict",
        `accreditation body is retired (not newly grantable): ${bodyId}`,
      );
    }

    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO auth.media_accreditations(
         id, user_id, accreditation_body_id, expires_at, granted_by_admin_id, note
       ) VALUES($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        id,
        input.userId,
        bodyId,
        input.expiresAt ?? null,
        input.grantedByAdminId,
        input.note?.trim() || null,
      ],
    );
    return map(rows[0]);
  }

  /** Soft-revoke (sets revoked_at). Idempotent when already revoked. */
  async revoke(id: string): Promise<MediaAccreditationRecord> {
    const { rows } = await this.pool.query(
      `UPDATE auth.media_accreditations
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    if (!rows[0]) {
      throw new ServiceError("not_found", `media accreditation not found: ${id}`);
    }
    return map(rows[0]);
  }
}

function map(r: any): MediaAccreditationRecord {
  return {
    id: r.id,
    userId: r.user_id,
    accreditationBodyId: r.accreditation_body_id,
    expiresAt: r.expires_at ? (r.expires_at.toISOString?.() ?? String(r.expires_at)) : null,
    revokedAt: r.revoked_at ? (r.revoked_at.toISOString?.() ?? String(r.revoked_at)) : null,
    grantedAt: r.granted_at.toISOString?.() ?? String(r.granted_at),
    grantedByAdminId: r.granted_by_admin_id,
    note: r.note,
  };
}
