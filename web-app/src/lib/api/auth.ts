/**
 * Auth/session API — registration OTP, passkey enroll/login, logout.
 * Cookie sessions flow through the Next.js `/v1` proxy (same-origin).
 */

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiGet, apiPost } from "./client";

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

export async function enrollPasskey(label = "this device"): Promise<void> {
  const options = await apiPost<PublicKeyCredentialCreationOptionsJSON>(
    "/v1/auth/passkey/register/options",
  );
  if (!options) throw new Error("passkey register options missing");
  const attResp = await startRegistration({ optionsJSON: options });
  await apiPost("/v1/auth/passkey/register/verify", {
    response: attResp,
    label,
  });
}

export async function loginWithPasskey(email?: string): Promise<VerifyRegistrationResult> {
  const options = await apiPost<PublicKeyCredentialRequestOptionsJSON>(
    "/v1/auth/passkey/login/options",
    email ? { email } : {},
  );
  if (!options) throw new Error("passkey login options missing");
  const asgResp = await startAuthentication({ optionsJSON: options });
  const body = await apiPost<{ userId: string; session: SessionInfo }>(
    "/v1/auth/passkey/login/verify",
    { response: asgResp },
  );
  if (!body) throw new Error("passkey login verify returned empty body");
  return { userId: body.userId, session: body.session };
}

export async function listPasskeys(): Promise<AuthPasskey[]> {
  const body = await apiGet<{ passkeys: AuthPasskey[] }>("/v1/auth/passkeys");
  return body?.passkeys ?? [];
}

export async function logout(): Promise<void> {
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
