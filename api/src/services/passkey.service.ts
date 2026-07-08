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
