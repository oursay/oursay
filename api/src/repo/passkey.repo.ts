// Data access for auth.passkey_credentials (account-login WebAuthn creds), short-lived
// auth.webauthn_challenges that bind a ceremony to its challenge, and
// auth.enrollment_authorizations (step-up grants for full-session add-device).

import type pg from "pg";

export type ChallengePurpose = "register" | "login" | "enroll_auth";

export interface PasskeyCredentialRecord {
  id: string;
  userId: string;
  credentialId: string; // base64url
  publicKey: Buffer; // COSE bytes
  counter: number;
  transports: string | null;
  aaguid: string | null;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface InsertCredentialInput {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: Buffer;
  counter: number;
  transports: string | null;
  aaguid: string | null;
  label: string | null;
}

export interface ChallengeRecord {
  id: string;
  userId: string | null;
  emailCanonical: string | null;
  challenge: string;
  purpose: ChallengePurpose;
  expiresAt: string;
}

export interface EnrollmentAuthorizationRecord {
  id: string;
  userId: string;
  tokenHash: string;
  registerChallengeId: string | null;
  expiresAt: string;
}

export class PasskeyRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insertCredential(c: InsertCredentialInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.passkey_credentials
         (id, user_id, credential_id, public_key, counter, transports, aaguid, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c.id, c.userId, c.credentialId, c.publicKey, c.counter, c.transports, c.aaguid, c.label],
    );
  }

  async listByUserId(userId: string): Promise<PasskeyCredentialRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.passkey_credentials WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return rows.map(mapCredential);
  }

  async getByCredentialId(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM auth.passkey_credentials WHERE credential_id = $1`,
      [credentialId],
    );
    return rows[0] ? mapCredential(rows[0]) : null;
  }

  /** Hard-delete one of a user's credentials, scoped by user_id so a caller can only remove its own.
   *  Returns true if a row was deleted. */
  async deleteByIdForUser(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM auth.passkey_credentials WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Owner-scoped label update; 404 when the passkey isn't theirs. */
  async updateLabel(userId: string, id: string, label: string | null): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE auth.passkey_credentials SET label = $3 WHERE id = $1 AND user_id = $2`,
      [id, userId, label],
    );
    return (rowCount ?? 0) > 0;
  }

  async updateCounter(credentialId: string, counter: number, lastUsedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE auth.passkey_credentials SET counter = $2, last_used_at = $3 WHERE credential_id = $1`,
      [credentialId, counter, lastUsedAt],
    );
  }

  // ── ceremony challenges ──────────────────────────────────────────────────

  async insertChallenge(c: {
    id: string;
    userId: string | null;
    emailCanonical: string | null;
    challenge: string;
    purpose: ChallengePurpose;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.webauthn_challenges (id, user_id, email_canonical, challenge, purpose, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [c.id, c.userId, c.emailCanonical, c.challenge, c.purpose, c.expiresAt],
    );
  }

  /** Non-mutating lookup of an active (unconsumed, unexpired) challenge. */
  async getActiveChallenge(challenge: string, purpose: ChallengePurpose): Promise<ChallengeRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, email_canonical, challenge, purpose, expires_at
         FROM auth.webauthn_challenges
        WHERE challenge = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()`,
      [challenge, purpose],
    );
    return rows[0] ? mapChallenge(rows[0]) : null;
  }

  /** Atomically consume a matching, unexpired, unconsumed challenge; null if none. */
  async consumeChallenge(challenge: string, purpose: ChallengePurpose): Promise<ChallengeRecord | null> {
    const { rows } = await this.pool.query(
      `UPDATE auth.webauthn_challenges
          SET consumed_at = now()
        WHERE challenge = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
      RETURNING id, user_id, email_canonical, challenge, purpose, expires_at`,
      [challenge, purpose],
    );
    return rows[0] ? mapChallenge(rows[0]) : null;
  }

  /** Mark a challenge consumed (used when rolling back a failed bind of a just-created register challenge). */
  async invalidateChallenge(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth.webauthn_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
      [id],
    );
  }

  // ── enrollment authorizations ────────────────────────────────────────────

  async insertEnrollmentAuth(c: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.enrollment_authorizations (id, user_id, token_hash, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [c.id, c.userId, c.tokenHash, c.expiresAt],
    );
  }

  async getActiveEnrollmentAuth(tokenHash: string): Promise<EnrollmentAuthorizationRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, token_hash, register_challenge_id, expires_at
         FROM auth.enrollment_authorizations
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ? mapEnrollmentAuth(rows[0]) : null;
  }

  /**
   * Atomically bind an unbound, active enrollment authorization to a registration challenge.
   * Returns null if the grant is missing, expired, consumed, wrong user, or already bound.
   */
  async bindEnrollmentAuthToChallenge(input: {
    tokenHash: string;
    userId: string;
    registerChallengeId: string;
  }): Promise<EnrollmentAuthorizationRecord | null> {
    const { rows } = await this.pool.query(
      `UPDATE auth.enrollment_authorizations
          SET register_challenge_id = $3
        WHERE token_hash = $1
          AND user_id = $2
          AND consumed_at IS NULL
          AND expires_at > now()
          AND register_challenge_id IS NULL
      RETURNING id, user_id, token_hash, register_challenge_id, expires_at`,
      [input.tokenHash, input.userId, input.registerChallengeId],
    );
    return rows[0] ? mapEnrollmentAuth(rows[0]) : null;
  }

  /**
   * Consume the matching registration challenge + bound enrollment authorization and insert the
   * credential in one transaction. Returns false if either consume raced (concurrent verify).
   */
  async finalizeAuthorizedEnrollment(input: {
    challenge: string;
    userId: string;
    enrollmentTokenHash: string;
    registerChallengeId: string;
    credential: InsertCredentialInput;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const challengeRes = await client.query(
        `UPDATE auth.webauthn_challenges
            SET consumed_at = now()
          WHERE challenge = $1
            AND purpose = 'register'
            AND id = $2
            AND user_id = $3
            AND consumed_at IS NULL
            AND expires_at > now()
        RETURNING id`,
        [input.challenge, input.registerChallengeId, input.userId],
      );
      if (!challengeRes.rows[0]) {
        await client.query("ROLLBACK");
        return false;
      }

      const authRes = await client.query(
        `UPDATE auth.enrollment_authorizations
            SET consumed_at = now()
          WHERE token_hash = $1
            AND user_id = $2
            AND register_challenge_id = $3
            AND consumed_at IS NULL
            AND expires_at > now()
        RETURNING id`,
        [input.enrollmentTokenHash, input.userId, input.registerChallengeId],
      );
      if (!authRes.rows[0]) {
        await client.query("ROLLBACK");
        return false;
      }

      const c = input.credential;
      await client.query(
        `INSERT INTO auth.passkey_credentials
           (id, user_id, credential_id, public_key, counter, transports, aaguid, label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [c.id, c.userId, c.credentialId, c.publicKey, c.counter, c.transports, c.aaguid, c.label],
      );

      await client.query("COMMIT");
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

function mapCredential(r: any): PasskeyCredentialRecord {
  return {
    id: r.id,
    userId: r.user_id,
    credentialId: r.credential_id,
    publicKey: r.public_key,
    counter: Number(r.counter),
    transports: r.transports,
    aaguid: r.aaguid,
    label: r.label,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
    lastUsedAt: r.last_used_at ? (r.last_used_at.toISOString?.() ?? String(r.last_used_at)) : null,
  };
}

function mapChallenge(r: any): ChallengeRecord {
  return {
    id: r.id,
    userId: r.user_id,
    emailCanonical: r.email_canonical,
    challenge: r.challenge,
    purpose: r.purpose,
    expiresAt: r.expires_at.toISOString?.() ?? String(r.expires_at),
  };
}

function mapEnrollmentAuth(r: any): EnrollmentAuthorizationRecord {
  return {
    id: r.id,
    userId: r.user_id,
    tokenHash: r.token_hash,
    registerChallengeId: r.register_challenge_id ?? null,
    expiresAt: r.expires_at.toISOString?.() ?? String(r.expires_at),
  };
}
