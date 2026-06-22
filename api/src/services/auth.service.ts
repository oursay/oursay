// AuthService: issue, resolve, and revoke opaque DB-backed sessions. The raw token is returned once
// (to set as a Bearer credential and/or session cookie); only its hash is stored.

import { randomUUID } from "node:crypto";
import type { SessionConfig } from "../config.js";
import { systemNow, type Now } from "../errors.js";
import { expiryFrom } from "../helpers/otp.js";
import { hashToken, newSessionToken } from "../helpers/tokens.js";
import type { SessionRepo, SessionRecord } from "../repo/session.repo.js";

export type SessionScope = "full" | "recovery" | "login";

export interface IssuedSession {
  token: string;
  scope: SessionScope;
  userId: string;
  expiresAt: string;
}

export interface AuthServiceDeps {
  sessionRepo: SessionRepo;
  config: SessionConfig;
  now?: Now;
}

export class AuthService {
  private readonly now: Now;
  constructor(private readonly d: AuthServiceDeps) {
    this.now = d.now ?? systemNow;
  }

  /** Issue a session. Pass `credentialId` for passkey-login sessions so they can be revoked when that
   *  passkey is removed (kick a device); leave it undefined for OTP registration/recovery/login. */
  async issue(
    userId: string,
    scope: SessionScope,
    userAgent: string | null,
    credentialId?: string | null,
  ): Promise<IssuedSession> {
    const { token, hash } = newSessionToken(this.d.config.secret);
    const expiresAt = expiryFrom(this.now(), this.d.config.ttlSec);
    await this.d.sessionRepo.insert({ id: randomUUID(), userId, tokenHash: hash, scope, credentialId, userAgent, expiresAt });
    return { token, scope, userId, expiresAt: expiresAt.toISOString() };
  }

  /** Resolve a presented token to its active session, or null. */
  async resolve(token: string): Promise<SessionRecord | null> {
    if (!token) return null;
    return this.d.sessionRepo.getActiveByTokenHash(hashToken(token, this.d.config.secret));
  }

  async revoke(token: string): Promise<void> {
    await this.d.sessionRepo.revokeByTokenHash(hashToken(token, this.d.config.secret));
  }

  async revokeAllForUser(userId: string): Promise<number> {
    return this.d.sessionRepo.revokeAllForUser(userId);
  }

  /** Revoke all sessions established by a passkey (used when that passkey is removed). */
  async revokeSessionsForCredential(credentialId: string): Promise<number> {
    return this.d.sessionRepo.revokeByCredentialId(credentialId);
  }

  listForUser(userId: string): Promise<SessionRecord[]> {
    return this.d.sessionRepo.listByUserId(userId);
  }
}
