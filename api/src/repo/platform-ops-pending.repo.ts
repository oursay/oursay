// Short-lived prepare memory for platform-ops submit (auth.platform_ops_pending).

import type pg from "pg";
import type { PlatformOpsKind, PlatformOpsRequest } from "@oursay/public-record";

export interface PlatformOpsPendingRecord {
  requestId: string;
  requestHash: string;
  clearMessage: PlatformOpsRequest;
  kind: PlatformOpsKind;
  jurisdictionId: string;
  preparedBy: string;
  expiresAt: string;
}

export class PlatformOpsPendingRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insert(row: {
    requestId: string;
    requestHash: string;
    clearMessage: PlatformOpsRequest;
    kind: PlatformOpsKind;
    jurisdictionId: string;
    preparedBy: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.platform_ops_pending
         (request_id, request_hash, clear_message, kind, jurisdiction_id, prepared_by, expires_at)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)`,
      [
        row.requestId,
        row.requestHash,
        JSON.stringify(row.clearMessage),
        row.kind,
        row.jurisdictionId,
        row.preparedBy,
        row.expiresAt,
      ],
    );
  }

  /** Atomically consume a matching, unexpired, unconsumed prepare; null if none. */
  async consume(requestId: string): Promise<PlatformOpsPendingRecord | null> {
    const { rows } = await this.pool.query(
      `UPDATE auth.platform_ops_pending
          SET consumed_at = now()
        WHERE request_id = $1
          AND consumed_at IS NULL
          AND expires_at > now()
      RETURNING request_id, request_hash, clear_message, kind, jurisdiction_id, prepared_by, expires_at`,
      [requestId],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async getActive(requestId: string): Promise<PlatformOpsPendingRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT request_id, request_hash, clear_message, kind, jurisdiction_id, prepared_by, expires_at
         FROM auth.platform_ops_pending
        WHERE request_id = $1 AND consumed_at IS NULL AND expires_at > now()`,
      [requestId],
    );
    return rows[0] ? map(rows[0]) : null;
  }
}

function map(r: any): PlatformOpsPendingRecord {
  return {
    requestId: r.request_id,
    requestHash: r.request_hash,
    clearMessage: r.clear_message as PlatformOpsRequest,
    kind: r.kind,
    jurisdictionId: r.jurisdiction_id,
    preparedBy: r.prepared_by,
    expiresAt: r.expires_at.toISOString?.() ?? String(r.expires_at),
  };
}
