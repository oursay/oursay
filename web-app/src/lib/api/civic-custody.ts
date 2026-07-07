/**
 * Civic custody bootstrap — binds account-login passkey to civic signing material.
 */

import {
  IdentitySession,
  WebPasskeyConnector,
  loadCustodyBinding,
  loadPrfRootSession,
  saveCustodyBinding,
  savePrfRootSession,
  clearPrfRootSession,
  type CustodyUnlockSource,
} from "@oursay/identity/client/browser";

let cachedCustodySession: IdentitySession | null = null;
let cachedCustodyUserId: string | null = null;

/** In-memory civic custody session warmed at login; cleared on logout. */
export function getCachedCustodySession(userId: string): IdentitySession | null {
  if (cachedCustodyUserId === userId && cachedCustodySession) return cachedCustodySession;
  return null;
}

export function clearCachedCustodySession(): void {
  const userId = cachedCustodyUserId;
  cachedCustodySession = null;
  cachedCustodyUserId = null;
  if (userId) clearPrfRootSession(userId);
}

function cacheCustodySession(userId: string, session: IdentitySession): IdentitySession {
  cachedCustodySession = session;
  cachedCustodyUserId = userId;
  return session;
}

/**
 * Persist custody binding after account passkey login/register and warm the in-memory session
 * so the first civic write (e.g. a reaction) needs no additional WebAuthn prompt.
 */
export async function bootstrapCivicCustody(
  userId: string,
  credentialIdHex: string,
  prfRoot: Uint8Array | null,
): Promise<void> {
  const rpId = typeof location !== "undefined" ? location.hostname : "localhost";
  const conn = new WebPasskeyConnector({ rpId });

  let unlockSource: CustodyUnlockSource;
  let session: IdentitySession;

  if (prfRoot) {
    unlockSource = "prf";
    savePrfRootSession(userId, prfRoot);
    session = new IdentitySession(
      conn.buildSessionFromPrfRoot({ userId, credentialIdHex, prfRoot }),
    );
  } else {
    unlockSource = "secure-store";
    session = new IdentitySession(
      await conn.unlockFromAccountCredential({
        userId,
        credentialIdHex,
        unlockSource: "secure-store",
      }),
    );
  }

  saveCustodyBinding(userId, { credentialIdHex, unlockSource });
  cacheCustodySession(userId, session);
}

/** Warm custody from a saved binding (e.g. after cookie session restore). Silent when possible. */
export async function warmCivicCustody(userId: string): Promise<void> {
  if (getCachedCustodySession(userId)) return;
  const binding = loadCustodyBinding(userId);
  if (!binding) return;
  await loadCustodySession(userId);
}

/** Load or unlock civic custody for civic writes (uses cache when available). */
export async function loadCustodySession(userId: string): Promise<IdentitySession> {
  const cached = getCachedCustodySession(userId);
  if (cached) return cached;

  const binding = loadCustodyBinding(userId);
  if (!binding) {
    throw new Error("Sign in with your passkey to participate — civic signing requires passkey login.");
  }

  const rpId = typeof location !== "undefined" ? location.hostname : "localhost";
  const conn = new WebPasskeyConnector({ rpId });

  if (binding.unlockSource === "prf") {
    const prfRoot = loadPrfRootSession(userId);
    if (prfRoot) {
      return cacheCustodySession(
        userId,
        new IdentitySession(
          conn.buildSessionFromPrfRoot({
            userId,
            credentialIdHex: binding.credentialIdHex,
            prfRoot,
          }),
        ),
      );
    }
  }

  const session = new IdentitySession(
    await conn.unlockFromAccountCredential({
      userId,
      credentialIdHex: binding.credentialIdHex,
      unlockSource: binding.unlockSource,
    }),
  );
  if (conn.lastUnlockSource === "prf" && conn.lastPrfRoot) {
    savePrfRootSession(userId, conn.lastPrfRoot);
  }
  return cacheCustodySession(userId, session);
}
