/**
 * Auth/session API — registration OTP, passkey enroll/login, logout.
 * Cookie sessions flow through the Next.js `/v1` proxy (same-origin).
 */

import { startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiGet, apiPatch, apiPost, ApiError } from "./client";
import { authenticateWithPrfProbe } from "./passkey-prf";
import { bootstrapCivicCustody, clearCachedCustodySession } from "./civic-custody";

export interface RegistrationProfile {
  handle: string;
  displayName?: string;
  over18: boolean;
  firstName?: string;
  lastName?: string;
  address?: {
    line1?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface SessionInfo {
  token: string;
  scope: "full" | "registration" | "recovery";
}

/** Account-login passkey metadata from `GET /v1/auth/passkeys` (no key material). */
export interface AuthPasskey {
  id: string;
  label: string | null;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function passkeyDisplayLabel(pk: AuthPasskey): string {
  const label = pk.label?.trim();
  return label || "Unnamed passkey";
}

export interface VerifyRegistrationResult {
  userId: string;
  session: SessionInfo;
}

export interface EnableLoginResult {
  status: "sent";
  expiresAt: string;
}

export interface VerifyLoginResult {
  status: "passkey_enroll";
  userId: string;
  session: SessionInfo;
}

export interface EnableRecoveryResult {
  status: "sent";
  expiresAt?: string;
}

export interface VerifyRecoveryResult {
  status: "passkey_reenroll";
  userId: string;
  session: SessionInfo;
}

export async function requestRegistrationOtp(email: string): Promise<void> {
  await apiPost("/v1/auth/otp/request", { email, purpose: "registration" });
}

export async function verifyRegistrationOtp(
  email: string,
  code: string,
  profile: RegistrationProfile,
): Promise<VerifyRegistrationResult> {
  const body = await apiPost<{
    userId: string;
    session: SessionInfo;
  }>("/v1/auth/otp/verify", {
    email,
    code,
    profile: {
      handle: profile.handle.trim(),
      over18: profile.over18 !== false,
      ...(profile.displayName?.trim() ? { displayName: profile.displayName.trim() } : {}),
      ...(profile.firstName?.trim() ? { firstName: profile.firstName.trim() } : {}),
      ...(profile.lastName?.trim() ? { lastName: profile.lastName.trim() } : {}),
      ...(profile.address ? { address: profile.address } : {}),
    },
  });
  if (!body) throw new Error("OTP verify returned empty body");
  return { userId: body.userId, session: body.session };
}

/**
 * Trusted-device enablement for gated cross-device login.
 *
 * Opens a short-lived login window and sends a `purpose:'login'` OTP to the
 * account email.
 */
export async function enableLogin(): Promise<EnableLoginResult> {
  const body = await apiPost<EnableLoginResult>("/v1/auth/login/enable");
  if (!body) throw new Error("login enable returned empty body");
  return body;
}

/**
 * Unified OTP send for recovery.
 *
 * This uses the unified OTP endpoint with `purpose:"recovery"`, then the
 * client redeems the code at `/v1/auth/recovery/verify`.
 */
export async function requestRecoveryOtp(email: string): Promise<EnableRecoveryResult> {
  const body = await apiPost<EnableRecoveryResult>("/v1/auth/otp/request", {
    email,
    purpose: "recovery",
  });
  if (!body) throw new Error("recovery otp request returned empty body");
  return body;
}

/**
 * Optional: resend a gated cross-device login OTP while the trusted-device
 * window is open.
 */
export async function requestLoginOtp(email: string): Promise<EnableLoginResult> {
  const body = await apiPost<EnableLoginResult>("/v1/auth/otp/request", {
    email,
    purpose: "login",
  });
  if (!body) throw new Error("login otp request returned empty body");
  return body;
}

/**
 * New-device redemption of gated login OTP.
 *
 * Sets a limited `login` session (enroll-only). The caller should then
 * enroll a new passkey and complete a passkey login.
 */
export async function verifyLoginOtp(
  email: string,
  code: string,
): Promise<VerifyLoginResult> {
  const body = await apiPost<VerifyLoginResult>("/v1/auth/login/verify", { email, code });
  if (!body) throw new Error("login verify returned empty body");
  return body;
}

export async function verifyRecoveryOtp(
  email: string,
  code: string,
): Promise<VerifyRecoveryResult> {
  const body = await apiPost<VerifyRecoveryResult>("/v1/auth/recovery/verify", { email, code });
  if (!body) throw new Error("recovery verify returned empty body");
  return body;
}

export async function enrollPasskey(label?: string): Promise<void> {
  const options = await apiPost<PublicKeyCredentialCreationOptionsJSON>(
    "/v1/auth/passkey/register/options",
  );
  if (!options) throw new Error("passkey register options missing");
  const attResp = await startRegistration({ optionsJSON: options });
  const trimmed = label?.trim();
  await apiPost("/v1/auth/passkey/register/verify", {
    response: attResp,
    ...(trimmed ? { label: trimmed } : {}),
  });
}

export async function loginWithPasskey(email?: string): Promise<VerifyRegistrationResult> {
  const options = await apiPost<PublicKeyCredentialRequestOptionsJSON>(
    "/v1/auth/passkey/login/options",
    email ? { email } : {},
  );
  if (!options) throw new Error("passkey login options missing");
  const { response: asgResp, credentialIdHex, prfRoot } = await authenticateWithPrfProbe(options);
  const body = await apiPost<{ userId: string; session: SessionInfo }>(
    "/v1/auth/passkey/login/verify",
    { response: asgResp },
  );
  if (!body) throw new Error("passkey login verify returned empty body");
  await bootstrapCivicCustody(body.userId, credentialIdHex, prfRoot);
  return { userId: body.userId, session: body.session };
}

export async function listPasskeys(): Promise<AuthPasskey[]> {
  const body = await apiGet<{ passkeys: AuthPasskey[] }>("/v1/auth/passkeys");
  return body?.passkeys ?? [];
}

export async function updatePasskeyLabel(
  id: string,
  label: string | null,
): Promise<AuthPasskey> {
  const body = await apiPatch<{ passkey: AuthPasskey }>("/v1/auth/passkey/label", {
    id,
    label,
  });
  if (!body?.passkey) throw new Error("passkey label update returned empty body");
  return body.passkey;
}

/** Remove one of the caller's own passkeys. The server returns 422 for the last remaining passkey
 *  or the passkey tied to this session; 404 if the id isn't the caller's. */
export async function revokePasskey(id: string): Promise<void> {
  await apiPost("/v1/auth/passkey/revoke", { id });
}

/** User-facing toast when passkey revoke fails (422 self-session uses dedicated copy). */
export function passkeyRevokeFailureToast(e: unknown): string {
  if (e instanceof ApiError && e.status === 422 && e.code === "unprocessable") {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "current_session") {
      return "This passkey signed you in on this device. Sign out first, or remove a passkey from another device.";
    }
  }
  if (e instanceof Error) return e.message;
  return "Could not remove passkey.";
}

export async function logout(): Promise<void> {
  clearCachedCustodySession();
  await apiPost("/v1/auth/logout");
}

export async function getSession(): Promise<{ userId: string; scope: string } | null> {
  try {
    return await apiGet<{ userId: string; scope: string }>("/v1/auth/session");
  } catch (e) {
    if (e instanceof Error && "status" in e && (e as { status: number }).status === 401) {
      return null;
    }
    throw e;
  }
}
