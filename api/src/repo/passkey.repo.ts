// Data access for auth.passkey_credentials (account-login WebAuthn creds) and the short-lived
// auth.webauthn_challenges that bind a ceremony to its challenge.

import type pg from "pg";

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
  purpose: "register" | "login";
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
    purpose: "register" | "login";
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.webauthn_challenges (id, user_id, email_canonical, challenge, purpose, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [c.id, c.userId, c.emailCanonical, c.challenge, c.purpose, c.expiresAt],
    );
  }

  /** Atomically consume a matching, unexpired, unconsumed challenge; null if none. */
  async consumeChallenge(challenge: string, purpose: "register" | "login"): Promise<ChallengeRecord | null> {
    const { rows } = await this.pool.query(
      `UPDATE auth.webauthn_challenges
          SET consumed_at = now()
        WHERE challenge = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
      RETURNING id, user_id, email_canonical, challenge, purpose, expires_at`,
      [challenge, purpose],
    );
    return rows[0] ? mapChallenge(rows[0]) : null;
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
