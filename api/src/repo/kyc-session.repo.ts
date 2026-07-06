// Tracks in-flight Didit (and future) KYC sessions — no decision payload / PII columns.

import type { Pool } from "pg";
import type { KycSessionStatus, KycSessionWorkflowKind } from "../services/kyc/session-provider.js";

export interface KycSessionRecord {
  id: string;
  userId: string;
  provider: string;
  providerSessionId: string;
  workflowKind: KycSessionWorkflowKind;
  status: KycSessionStatus;
  attestedAt: Date | null;
  lastPolledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class KycSessionRepo {
  constructor(private readonly pool: Pool) {}

  async insert(row: {
    id: string;
    userId: string;
    provider: string;
    providerSessionId: string;
    workflowKind: KycSessionWorkflowKind;
    status: KycSessionStatus;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.kyc_sessions
         (id, user_id, provider, provider_session_id, workflow_kind, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.id, row.userId, row.provider, row.providerSessionId, row.workflowKind, row.status],
    );
  }

  async getForUser(userId: string, providerSessionId: string): Promise<KycSessionRecord | null> {
    const r = await this.pool.query(
      `SELECT * FROM auth.kyc_sessions WHERE user_id = $1 AND provider_session_id = $2`,
      [userId, providerSessionId],
    );
    return r.rows[0] ? map(r.rows[0]) : null;
  }

  async getByProviderSessionId(providerSessionId: string): Promise<KycSessionRecord | null> {
    const r = await this.pool.query(`SELECT * FROM auth.kyc_sessions WHERE provider_session_id = $1`, [
      providerSessionId,
    ]);
    return r.rows[0] ? map(r.rows[0]) : null;
  }

  async updateStatus(providerSessionId: string, status: KycSessionStatus): Promise<void> {
    await this.pool.query(
      `UPDATE auth.kyc_sessions SET status = $2, updated_at = now() WHERE provider_session_id = $1`,
      [providerSessionId, status],
    );
  }

  async markPolled(providerSessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth.kyc_sessions SET last_polled_at = now(), updated_at = now() WHERE provider_session_id = $1`,
      [providerSessionId],
    );
  }

  /** Idempotent attestation claim — returns the row only when this call won the race. */
  async claimAttestation(providerSessionId: string): Promise<KycSessionRecord | null> {
    const r = await this.pool.query(
      `UPDATE auth.kyc_sessions
          SET attested_at = now(), updated_at = now()
        WHERE provider_session_id = $1 AND attested_at IS NULL
        RETURNING *`,
      [providerSessionId],
    );
    return r.rows[0] ? map(r.rows[0]) : null;
  }
}

function map(r: Record<string, unknown>): KycSessionRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    provider: String(r.provider),
    providerSessionId: String(r.provider_session_id),
    workflowKind: r.workflow_kind as KycSessionWorkflowKind,
    status: r.status as KycSessionStatus,
    attestedAt: r.attested_at ? new Date(String(r.attested_at)) : null,
    lastPolledAt: r.last_polled_at ? new Date(String(r.last_polled_at)) : null,
    createdAt: new Date(String(r.created_at)),
    updatedAt: new Date(String(r.updated_at)),
  };
}
