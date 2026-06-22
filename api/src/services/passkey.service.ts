// PasskeyService: WebAuthn registration + login ceremonies over @simplewebauthn/server.
//
// These are ACCOUNT-LOGIN passkeys (docs/08 §2) — they prove who is logged in and never sign the
// civic record. After enrollment, passkey assertion is the day-to-day login; email OTP is only
// bootstrap/recovery.
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
import { relyingParty, toBuffer, toUint8, type RelyingParty } from "../helpers/webauthn.js";
import type { PasskeyRepo } from "../repo/passkey.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { AuthService, IssuedSession } from "./auth.service.js";

export interface PasskeyServiceDeps {
  passkeyRepo: PasskeyRepo;
  profileRepo: ProfileRepo;
  authService: AuthService;
  rp?: RelyingParty;
  challengeTtlSec?: number;
  now?: Now;
}

export interface PasskeyLoginResult {
  userId: string;
  session: IssuedSession;
}

/** Public view of an enrolled account-login passkey. No key material — just management metadata. */
export interface PasskeyView {
  id: string;
  label: string | null;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export class PasskeyService {
  private readonly now: Now;
  private readonly rp: RelyingParty;
  private readonly challengeTtlSec: number;

  constructor(private readonly d: PasskeyServiceDeps) {
    this.now = d.now ?? systemNow;
    this.rp = d.rp ?? relyingParty();
    this.challengeTtlSec = d.challengeTtlSec ?? 300;
  }

  // ── registration (authenticated) ─────────────────────────────────────────

  async registerOptions(input: {
    userId: string;
    userName: string;
    userDisplayName: string;
  }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await this.d.passkeyRepo.listByUserId(input.userId);
    const options = await generateRegistrationOptions({
      rpName: this.rp.rpName,
      rpID: this.rp.rpID,
      userID: new TextEncoder().encode(input.userId),
      userName: input.userName,
      userDisplayName: input.userDisplayName,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: splitTransports(c.transports) })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });
    await this.storeChallenge(options.challenge, "register", input.userId, null);
    return options;
  }

  async registerVerify(input: {
    userId: string;
    response: RegistrationResponseJSON;
    label?: string | null;
  }): Promise<{ credentialId: string }> {
    const challenge = extractChallenge(input.response.response.clientDataJSON);
    const stored = await this.d.passkeyRepo.consumeChallenge(challenge, "register");
    if (!stored || stored.userId !== input.userId) {
      throw new ServiceError("challenge_invalid", "Registration challenge is invalid or expired");
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: this.rp.origin,
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
      label: input.label ?? null,
    });
    return { credentialId: credential.id };
  }

  // ── device management (authenticated, full session) ──────────────────────

  /** List the caller's enrolled account-login passkeys (one per device). Metadata only. */
  async list(userId: string): Promise<PasskeyView[]> {
    const creds = await this.d.passkeyRepo.listByUserId(userId);
    return creds.map((c) => ({
      id: c.id,
      label: c.label,
      transports: c.transports,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    }));
  }

  /** Remove one of the caller's OWN passkeys ("kick a compromised/retired device"). 404 when it isn't
   *  theirs (no cross-account info). Refuses to remove the LAST passkey — that would lock the account
   *  out of normal login; the user must use recovery instead. Also revokes the sessions that passkey
   *  established, so a kicked device loses access immediately. */
  async revoke(input: { userId: string; id: string }): Promise<void> {
    const creds = await this.d.passkeyRepo.listByUserId(input.userId);
    if (!creds.some((c) => c.id === input.id)) {
      throw new ServiceError("not_found", "No such passkey for this account");
    }
    if (creds.length <= 1) {
      throw new ServiceError("forbidden", "Cannot remove your last passkey; use recovery to reset access");
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
        expectedOrigin: this.rp.origin,
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

  private async storeChallenge(
    challenge: string,
    purpose: "register" | "login",
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
