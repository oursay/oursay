// PasskeyService: WebAuthn registration + login ceremonies over @simplewebauthn/server.
//
// These are ACCOUNT-LOGIN passkeys (docs/08 §2) — they prove who is logged in and never sign the
// civic record. After enrollment, passkey assertion is the day-to-day login; email OTP is only
// bootstrap/recovery.
//
// Full-session add-device requires a short-lived enrollment authorization minted after a fresh
// assertion of an existing account passkey. Bootstrap scopes (registration / recovery / login)
// enroll without that grant.
//
// Challenges are persisted (auth.webauthn_challenges) and matched back from the ceremony response's
// clientDataJSON, so verification is stateless across requests and works for usernameless login.

import { randomUUID } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { ServiceError, systemNow, type Now } from "../errors.js";
import { expiryFrom } from "../helpers/otp.js";
import {
  hashEnrollmentAuthorization,
  newEnrollmentAuthorizationToken,
} from "../helpers/tokens.js";
import { relyingParty, toBuffer, toUint8, type RelyingParty } from "../helpers/webauthn.js";
import type { ChallengePurpose, PasskeyRepo } from "../repo/passkey.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { AuthService, IssuedSession, SessionScope } from "./auth.service.js";

const BOOTSTRAP_SCOPES: ReadonlySet<SessionScope> = new Set(["registration", "recovery", "login"]);

export interface PasskeyServiceDeps {
  passkeyRepo: PasskeyRepo;
  profileRepo: ProfileRepo;
  authService: AuthService;
  /** Session pepper — also hashes enrollment-authorization tokens. */
  sessionSecret: string;
  rp?: RelyingParty;
  challengeTtlSec?: number;
  enrollAuthTtlSec?: number;
  now?: Now;
}

export interface PasskeyLoginResult {
  userId: string;
  session: IssuedSession;
}

export interface EnrollmentAuthorizationResult {
  enrollmentAuthorization: string;
  expiresAt: string;
}

/** Public view of an enrolled account-login passkey. No key material — just management metadata. */
export interface PasskeyView {
  id: string;
  /** User override when set; otherwise a server-resolved default from aaguid/transports. */
  label: string | null;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export class PasskeyService {
  private readonly now: Now;
  private readonly rp: RelyingParty;
  private readonly challengeTtlSec: number;
  private readonly enrollAuthTtlSec: number;

  constructor(private readonly d: PasskeyServiceDeps) {
    this.now = d.now ?? systemNow;
    this.rp = d.rp ?? relyingParty();
    this.challengeTtlSec = d.challengeTtlSec ?? 300;
    this.enrollAuthTtlSec = d.enrollAuthTtlSec ?? 300;
  }

  // ── enrollment authorization (full-session step-up) ───────────────────────

  /** Begin a step-up assertion against the caller's existing passkeys (does not mint a session). */
  async enrollAuthOptions(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const creds = await this.d.passkeyRepo.listByUserId(userId);
    if (creds.length === 0) {
      throw new ServiceError(
        "forbidden",
        "No passkey enrolled; use account recovery to re-enroll",
      );
    }
    const options = await generateAuthenticationOptions({
      rpID: this.rp.rpID,
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: splitTransports(c.transports),
      })),
      userVerification: "preferred",
    });
    await this.storeChallenge(options.challenge, "enroll_auth", userId, null);
    return options;
  }

  /** Verify a fresh assertion and mint a short-lived, single-use enrollment authorization. */
  async enrollAuthVerify(input: {
    userId: string;
    response: AuthenticationResponseJSON;
  }): Promise<EnrollmentAuthorizationResult> {
    const challenge = extractChallenge(input.response.response.clientDataJSON);
    const stored = await this.d.passkeyRepo.consumeChallenge(challenge, "enroll_auth");
    if (!stored || stored.userId !== input.userId) {
      throw new ServiceError("forbidden", "Enrollment authorization challenge is invalid or expired");
    }

    const cred = await this.d.passkeyRepo.getByCredentialId(input.response.id);
    if (!cred || cred.userId !== input.userId) {
      throw new ServiceError("forbidden", "Passkey does not belong to this account");
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: this.rp.origins,
        expectedRPID: this.rp.rpID,
        credential: {
          id: cred.credentialId,
          publicKey: toUint8(cred.publicKey),
          counter: cred.counter,
          transports: splitTransports(cred.transports),
        },
        requireUserVerification: this.rp.requireUserVerification,
      });
    } catch (e) {
      throw new ServiceError("passkey_verification_failed", (e as Error).message);
    }

    if (!verification.verified) {
      throw new ServiceError("passkey_verification_failed", "Passkey assertion could not be verified");
    }

    await this.d.passkeyRepo.updateCounter(cred.credentialId, verification.authenticationInfo.newCounter, this.now());

    const { token, hash } = newEnrollmentAuthorizationToken(this.d.sessionSecret);
    const expiresAt = expiryFrom(this.now(), this.enrollAuthTtlSec);
    await this.d.passkeyRepo.insertEnrollmentAuth({
      id: randomUUID(),
      userId: input.userId,
      tokenHash: hash,
      expiresAt,
    });
    return { enrollmentAuthorization: token, expiresAt: expiresAt.toISOString() };
  }

  // ── registration (authenticated) ─────────────────────────────────────────

  async registerOptions(input: {
    userId: string;
    userName: string;
    userDisplayName: string;
    scope: SessionScope;
    enrollmentAuthorization?: string | null;
    /** Calling session id — required for recovery (binds the ceremony; never client-supplied). */
    sessionId?: string | null;
  }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const needsGrant = this.requiresEnrollmentAuthorization(input.scope);
    const isRecovery = input.scope === "recovery";
    const existing = await this.d.passkeyRepo.listByUserId(input.userId);

    if (isRecovery) {
      if (!input.sessionId) {
        throw new ServiceError("forbidden", "Recovery enrollment requires an active recovery session");
      }
      const session = await this.d.authService.getActiveSession(input.sessionId);
      if (!session || session.userId !== input.userId || session.scope !== "recovery") {
        throw new ServiceError("forbidden", "Recovery enrollment requires an active recovery session");
      }
    }

    if (needsGrant) {
      if (existing.length === 0) {
        throw new ServiceError(
          "forbidden",
          "No passkey enrolled; use account recovery to re-enroll",
        );
      }
      if (!input.enrollmentAuthorization) {
        throw new ServiceError(
          "forbidden",
          "Fresh passkey assertion required to enroll another passkey",
        );
      }
    }

    const options = await generateRegistrationOptions({
      rpName: this.rp.rpName,
      rpID: this.rp.rpID,
      userID: new TextEncoder().encode(input.userId),
      userName: input.userName,
      userDisplayName: input.userDisplayName,
      attestationType: "none",
      // Recovery wipes prior credentials at verify; excluding them would block re-enrolling an
      // authenticator that still holds the old resident key.
      excludeCredentials: isRecovery
        ? []
        : existing.map((c) => ({ id: c.credentialId, transports: splitTransports(c.transports) })),
      // residentKey required: usernameless login needs a discoverable passkey. Android/GPM
      // can create a non-discoverable credential under "preferred", then fail the immediate
      // post-enroll assertion with empty allowCredentials.
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "preferred",
      },
    });

    const challengeId = randomUUID();
    await this.d.passkeyRepo.insertChallenge({
      id: challengeId,
      userId: input.userId,
      emailCanonical: null,
      challenge: options.challenge,
      purpose: "register",
      expiresAt: expiryFrom(this.now(), this.challengeTtlSec),
      sessionId: isRecovery ? input.sessionId! : null,
    });

    if (needsGrant) {
      const tokenHash = hashEnrollmentAuthorization(input.enrollmentAuthorization!, this.d.sessionSecret);
      const bound = await this.d.passkeyRepo.bindEnrollmentAuthToChallenge({
        tokenHash,
        userId: input.userId,
        registerChallengeId: challengeId,
      });
      if (!bound) {
        await this.d.passkeyRepo.invalidateChallenge(challengeId);
        throw new ServiceError(
          "forbidden",
          "Enrollment authorization is invalid, expired, or already used",
        );
      }
    }

    return options;
  }

  async registerVerify(input: {
    userId: string;
    response: RegistrationResponseJSON;
    label?: string | null;
    scope: SessionScope;
    enrollmentAuthorization?: string | null;
    /** Calling session id — required for recovery; never client-supplied. */
    sessionId?: string | null;
  }): Promise<{ credentialId: string }> {
    const challenge = extractChallenge(input.response.response.clientDataJSON);
    const needsGrant = this.requiresEnrollmentAuthorization(input.scope);
    const isRecovery = input.scope === "recovery";

    if (isRecovery) {
      if (!input.sessionId) {
        throw new ServiceError("forbidden", "Recovery enrollment requires an active recovery session");
      }

      const stored = await this.d.passkeyRepo.getActiveChallenge(challenge, "register");
      if (
        !stored ||
        stored.userId !== input.userId ||
        stored.sessionId !== input.sessionId
      ) {
        throw new ServiceError("challenge_invalid", "Registration challenge is invalid or expired");
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: input.response,
          expectedChallenge: challenge,
          expectedOrigin: this.rp.origins,
          expectedRPID: this.rp.rpID,
          requireUserVerification: this.rp.requireUserVerification,
        });
      } catch (e) {
        throw new ServiceError("passkey_verification_failed", (e as Error).message);
      }

      if (!verification.verified || !verification.registrationInfo) {
        throw new ServiceError("passkey_verification_failed", "Passkey registration could not be verified");
      }

      const { credential, aaguid } = verification.registrationInfo;
      const credentialRow = {
        id: randomUUID(),
        userId: input.userId,
        credentialId: credential.id,
        publicKey: toBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? null,
        aaguid: aaguid ?? null,
        label: normalizePasskeyLabel(input.label),
      };

      const result = await this.d.passkeyRepo.finalizeRecoveryEnrollment({
        userId: input.userId,
        recoverySessionId: input.sessionId,
        challenge,
        registerChallengeId: stored.id,
        credential: credentialRow,
      });
      if (!result.ok) {
        if (result.reason === "session") {
          throw new ServiceError("forbidden", "Recovery enrollment requires an active recovery session");
        }
        throw new ServiceError("challenge_invalid", "Registration challenge is invalid or expired");
      }
      return { credentialId: credential.id };
    }

    if (needsGrant) {
      if (!input.enrollmentAuthorization) {
        throw new ServiceError(
          "forbidden",
          "Fresh passkey assertion required to enroll another passkey",
        );
      }
      const existing = await this.d.passkeyRepo.listByUserId(input.userId);
      if (existing.length === 0) {
        throw new ServiceError(
          "forbidden",
          "No passkey enrolled; use account recovery to re-enroll",
        );
      }

      const stored = await this.d.passkeyRepo.getActiveChallenge(challenge, "register");
      if (!stored || stored.userId !== input.userId) {
        throw new ServiceError("challenge_invalid", "Registration challenge is invalid or expired");
      }

      const tokenHash = hashEnrollmentAuthorization(input.enrollmentAuthorization, this.d.sessionSecret);
      const grant = await this.d.passkeyRepo.getActiveEnrollmentAuth(tokenHash);
      if (
        !grant ||
        grant.userId !== input.userId ||
        grant.registerChallengeId !== stored.id
      ) {
        throw new ServiceError(
          "forbidden",
          "Enrollment authorization is invalid, expired, or not bound to this registration",
        );
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: input.response,
          expectedChallenge: challenge,
          expectedOrigin: this.rp.origins,
          expectedRPID: this.rp.rpID,
          requireUserVerification: this.rp.requireUserVerification,
        });
      } catch (e) {
        throw new ServiceError("passkey_verification_failed", (e as Error).message);
      }

      if (!verification.verified || !verification.registrationInfo) {
        throw new ServiceError("passkey_verification_failed", "Passkey registration could not be verified");
      }

      const { credential, aaguid } = verification.registrationInfo;
      const credentialRow = {
        id: randomUUID(),
        userId: input.userId,
        credentialId: credential.id,
        publicKey: toBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? null,
        aaguid: aaguid ?? null,
        label: normalizePasskeyLabel(input.label),
      };

      const ok = await this.d.passkeyRepo.finalizeAuthorizedEnrollment({
        challenge,
        userId: input.userId,
        enrollmentTokenHash: tokenHash,
        registerChallengeId: stored.id,
        credential: credentialRow,
      });
      if (!ok) {
        throw new ServiceError(
          "forbidden",
          "Enrollment authorization is invalid, expired, or already used",
        );
      }
      return { credentialId: credential.id };
    }

    // Bootstrap scopes (registration / login): consume challenge then insert (no enrollment grant).
    const stored = await this.d.passkeyRepo.consumeChallenge(challenge, "register");
    if (!stored || stored.userId !== input.userId) {
      throw new ServiceError("challenge_invalid", "Registration challenge is invalid or expired");
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: this.rp.origins,
        expectedRPID: this.rp.rpID,
        requireUserVerification: this.rp.requireUserVerification,
      });
    } catch (e) {
      throw new ServiceError("passkey_verification_failed", (e as Error).message);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new ServiceError("passkey_verification_failed", "Passkey registration could not be verified");
    }

    const { credential, aaguid } = verification.registrationInfo;
    await this.d.passkeyRepo.insertCredential({
      id: randomUUID(),
      userId: input.userId,
      credentialId: credential.id,
      publicKey: toBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports?.join(",") ?? null,
      aaguid: aaguid ?? null,
      label: normalizePasskeyLabel(input.label),
    });
    return { credentialId: credential.id };
  }

  // ── device management (authenticated, full session) ──────────────────────

  /** List the caller's enrolled account-login passkeys (one per device). Metadata only. */
  async list(userId: string): Promise<PasskeyView[]> {
    const creds = await this.d.passkeyRepo.listByUserId(userId);
    return creds.map(toPasskeyView);
  }

  /** Rename one of the caller's passkeys (user-facing device label). */
  async updateLabel(input: { userId: string; id: string; label: string | null }): Promise<PasskeyView> {
    const creds = await this.d.passkeyRepo.listByUserId(input.userId);
    const cred = creds.find((c) => c.id === input.id);
    if (!cred) {
      throw new ServiceError("not_found", "No such passkey for this account");
    }

    const normalized = normalizePasskeyLabel(input.label);
    const defaultLabel = resolveDefaultPasskeyLabel(cred.aaguid, cred.transports);
    const toStore =
      normalized == null || (defaultLabel != null && normalized === defaultLabel)
        ? null
        : normalized;

    const updated = await this.d.passkeyRepo.updateLabel(input.userId, input.id, toStore);
    if (!updated) {
      throw new ServiceError("not_found", "No such passkey for this account");
    }
    return toPasskeyView({ ...cred, label: toStore });
  }

  /** Remove one of the caller's OWN passkeys ("kick a compromised/retired device"). 404 when it isn't
   *  theirs (no cross-account info). Refuses to remove the LAST passkey (422) — that would lock the
   *  account out of normal login; the user must use recovery instead. Then refuses to remove the
   *  passkey that established the caller's current session (422) — sign out or kick another device
   *  instead. Also revokes the sessions that passkey established, so a kicked device loses access
   *  immediately. */
  async revoke(input: { userId: string; id: string; sessionCredentialId?: string | null }): Promise<void> {
    const creds = await this.d.passkeyRepo.listByUserId(input.userId);
    if (!creds.some((c) => c.id === input.id)) {
      throw new ServiceError("not_found", "No such passkey for this account");
    }
    if (creds.length <= 1) {
      throw new ServiceError("unprocessable", "Cannot remove your last passkey; use recovery to reset access");
    }
    if (input.sessionCredentialId && input.sessionCredentialId === input.id) {
      throw new ServiceError(
        "unprocessable",
        "Cannot remove the passkey for this session; sign out first or remove another device",
      );
    }
    await this.d.authService.revokeSessionsForCredential(input.id);
    await this.d.passkeyRepo.deleteByIdForUser(input.userId, input.id);
  }

  // ── login (passkey-only, no email password) ──────────────────────────────

  async loginOptions(input: { emailRaw?: string | null }): Promise<PublicKeyCredentialRequestOptionsJSON> {
    let userId: string | null = null;
    let emailCanonical: string | null = null;
    let allowCredentials: { id: string; transports?: ReturnType<typeof splitTransports> }[] = [];

    if (input.emailRaw) {
      const { normalizeEmail } = await import("../helpers/email.js");
      emailCanonical = normalizeEmail(input.emailRaw).canonical;
      const profile = await this.d.profileRepo.getByEmailCanonical(emailCanonical);
      if (profile) {
        userId = profile.userId;
        const creds = await this.d.passkeyRepo.listByUserId(userId);
        allowCredentials = creds.map((c) => ({ id: c.credentialId, transports: splitTransports(c.transports) }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rp.rpID,
      allowCredentials,
      userVerification: "preferred",
    });
    await this.storeChallenge(options.challenge, "login", userId, emailCanonical);
    return options;
  }

  async loginVerify(input: {
    response: AuthenticationResponseJSON;
    userAgent?: string | null;
  }): Promise<PasskeyLoginResult> {
    const challenge = extractChallenge(input.response.response.clientDataJSON);
    const stored = await this.d.passkeyRepo.consumeChallenge(challenge, "login");
    if (!stored) throw new ServiceError("challenge_invalid", "Login challenge is invalid or expired");

    const cred = await this.d.passkeyRepo.getByCredentialId(input.response.id);
    if (!cred) throw new ServiceError("passkey_verification_failed", "Unknown credential");

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: this.rp.origins,
        expectedRPID: this.rp.rpID,
        credential: {
          id: cred.credentialId,
          publicKey: toUint8(cred.publicKey),
          counter: cred.counter,
          transports: splitTransports(cred.transports),
        },
        requireUserVerification: this.rp.requireUserVerification,
      });
    } catch (e) {
      throw new ServiceError("passkey_verification_failed", (e as Error).message);
    }

    if (!verification.verified) {
      throw new ServiceError("passkey_verification_failed", "Passkey assertion could not be verified");
    }

    await this.d.passkeyRepo.updateCounter(cred.credentialId, verification.authenticationInfo.newCounter, this.now());
    // Pair the session to this passkey so removing the passkey (kick a device) cuts off its sessions.
    const session = await this.d.authService.issue(cred.userId, "full", input.userAgent ?? null, cred.id);
    return { userId: cred.userId, session };
  }

  private requiresEnrollmentAuthorization(scope: SessionScope): boolean {
    return scope === "full" || !BOOTSTRAP_SCOPES.has(scope);
  }

  private async storeChallenge(
    challenge: string,
    purpose: ChallengePurpose,
    userId: string | null,
    emailCanonical: string | null,
  ): Promise<void> {
    await this.d.passkeyRepo.insertChallenge({
      id: randomUUID(),
      userId,
      emailCanonical,
      challenge,
      purpose,
      expiresAt: expiryFrom(this.now(), this.challengeTtlSec),
    });
  }
}

function splitTransports(csv: string | null): ("ble" | "hybrid" | "internal" | "nfc" | "usb" | "cable" | "smart-card")[] | undefined {
  if (!csv) return undefined;
  return csv.split(",").map((s) => s.trim()).filter(Boolean) as any;
}

const PASSKEY_LABEL_MAX = 80;

function normalizePasskeyLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > PASSKEY_LABEL_MAX ? trimmed.slice(0, PASSKEY_LABEL_MAX) : trimmed;
}

// Curated AAGUID → display label for common consumer authenticators. Not exhaustive — the full FIDO
// Metadata Service is large and network-fetched; this covers the platform + password-manager
// authenticators most users present. Values from the community "passkey-authenticator-aaguids" list.
// Unknown/absent AAGUIDs fall back to transport-based labelling below.
const AAGUID_LABELS: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
};

/** Resolve a display label from stored authenticator metadata (never sent to clients). Prefers a
 *  known authenticator model by AAGUID, then falls back to the transport class. */
function resolveDefaultPasskeyLabel(aaguid: string | null, transports: string | null): string | null {
  const known = aaguid ? AAGUID_LABELS[aaguid.toLowerCase()] : undefined;
  if (known) return known;
  const parts = transports?.split(",").map((s) => s.trim()) ?? [];
  if (parts.some((t) => t === "hybrid")) return "Mobile Passkey";
  if (parts.some((t) => t === "ble")) return "Bluetooth Passkey";
  if (parts.some((t) => t === "usb")) return "USB Passkey";
  if (parts.some((t) => t === "nfc")) return "NFC Passkey";
  if (parts.includes("internal")) return "Built-In Passkey";
  return null;
}

function toPasskeyView(cred: {
  id: string;
  label: string | null;
  aaguid: string | null;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}): PasskeyView {
  return {
    id: cred.id,
    label: normalizePasskeyLabel(cred.label) ?? resolveDefaultPasskeyLabel(cred.aaguid, cred.transports),
    transports: cred.transports,
    createdAt: cred.createdAt,
    lastUsedAt: cred.lastUsedAt,
  };
}

/** Pull the base64url challenge the authenticator signed out of clientDataJSON. */
function extractChallenge(clientDataJSONB64Url: string): string {
  try {
    const json = JSON.parse(Buffer.from(clientDataJSONB64Url, "base64url").toString("utf8"));
    if (typeof json.challenge === "string" && json.challenge.length > 0) return json.challenge;
  } catch {
    /* fall through */
  }
  throw new ServiceError("challenge_invalid", "Malformed client data");
}
