// Browser-local binding between an account-login passkey credential and civic custody derivation.
// The account passkey (auth.passkey_credentials) seeds the device root; no separate civic passkey.

import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export type CustodyUnlockSource = "prf" | "secure-store";

export interface CustodyBinding {
  credentialIdHex: string;
  unlockSource: CustodyUnlockSource;
}

const STORAGE_PREFIX = "oursay/custody-binding/";
const PRF_SESSION_PREFIX = "oursay/custody-prf/";

export function custodyBindingStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** Persist the account passkey credential used for civic custody on this browser. */
export function saveCustodyBinding(userId: string, binding: CustodyBinding): void {
  if (typeof localStorage === "undefined") {
    throw new Error("saveCustodyBinding: localStorage unavailable");
  }
  localStorage.setItem(custodyBindingStorageKey(userId), JSON.stringify(binding));
}

/** Load the custody binding for a user, or null when none exists. */
export function loadCustodyBinding(userId: string): CustodyBinding | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(custodyBindingStorageKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CustodyBinding>;
    if (
      typeof parsed.credentialIdHex === "string" &&
      (parsed.unlockSource === "prf" || parsed.unlockSource === "secure-store")
    ) {
      return { credentialIdHex: parsed.credentialIdHex, unlockSource: parsed.unlockSource };
    }
  } catch {
    // fall through
  }
  return null;
}

export function clearCustodyBinding(userId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(custodyBindingStorageKey(userId));
  clearPrfRootSession(userId);
}

/** Persist the PRF root for the current browser tab (avoids re-prompting after module reload). */
export function savePrfRootSession(userId: string, prfRoot: Uint8Array): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${PRF_SESSION_PREFIX}${userId}`, bytesToHex(prfRoot));
}

/** Load a tab-scoped PRF root saved during login or a prior unlock. */
export function loadPrfRootSession(userId: string): Uint8Array | null {
  if (typeof sessionStorage === "undefined") return null;
  const hex = sessionStorage.getItem(`${PRF_SESSION_PREFIX}${userId}`);
  if (!hex) return null;
  try {
    return hexToBytes(hex);
  } catch {
    return null;
  }
}

export function clearPrfRootSession(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(`${PRF_SESSION_PREFIX}${userId}`);
}
