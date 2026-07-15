/**
 * Civic custody bootstrap — binds account-login passkey to civic signing material.
 */

import {
  IdentitySession,
  WebPasskeyConnector,
  loadCustodyBinding,
  resolvePrfRoot,
  saveCustodyBinding,
  savePrfRootSession,
  savePrfRootDurable,
  clearPrfRootSession,
  clearPrfRootDurable,
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
  if (userId) {
    clearPrfRootSession(userId);
    void clearPrfRootDurable(userId);
  }
}

function cacheCustodySession(userId: string, session: IdentitySession): IdentitySession {
  cachedCustodySession = session;
  cachedCustodyUserId = userId;
  return session;
}

function connector(): WebPasskeyConnector {
  const rpId = typeof location !== "undefined" ? location.hostname : "localhost";
  return new WebPasskeyConnector({ rpId });
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
  const conn = connector();

  let unlockSource: CustodyUnlockSource;
  let session: IdentitySession;

  if (prfRoot) {
    unlockSource = "prf";
    savePrfRootSession(userId, prfRoot);
    await savePrfRootDurable(userId, prfRoot);
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

/**
 * Unlock custody without WebAuthn when possible (session PRF, durable PRF, or secure-store).
 * Returns null when an interactive passkey assertion would be required.
 */
export async function trySilentCustodySession(
  userId: string,
): Promise<IdentitySession | null> {
  const cached = getCachedCustodySession(userId);
  if (cached) return cached;

  const binding = loadCustodyBinding(userId);
  if (!binding) return null;

  const conn = connector();

  if (binding.unlockSource === "prf") {
    const prfRoot = await resolvePrfRoot(userId);
    if (!prfRoot) return null;
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

  // secure-store: IndexedDB unwrap — no navigator.credentials.
  return cacheCustodySession(
    userId,
    new IdentitySession(
      await conn.unlockFromAccountCredential({
        userId,
        credentialIdHex: binding.credentialIdHex,
        unlockSource: "secure-store",
      }),
    ),
  );
}

/** Warm custody from a saved binding (e.g. after cookie session restore). Never prompts WebAuthn. */
export async function warmCivicCustody(userId: string): Promise<void> {
  if (getCachedCustodySession(userId)) return;
  try {
    await trySilentCustodySession(userId);
  } catch {
    // Unlock unavailable — the next civic write may prompt once, then soft-sign thereafter.
  }
}

/** Load or unlock civic custody for civic writes (uses silent paths first). */
export async function loadCustodySession(userId: string): Promise<IdentitySession> {
  const silent = await trySilentCustodySession(userId);
  if (silent) return silent;

  const binding = loadCustodyBinding(userId);
  if (!binding) {
    throw new Error("Sign in with your passkey to participate — civic signing requires passkey login.");
  }

  // Last resort: interactive unlock (PRF devices after logout-without-durable, etc.).
  const conn = connector();
  const session = new IdentitySession(
    await conn.unlockFromAccountCredential({
      userId,
      credentialIdHex: binding.credentialIdHex,
      unlockSource: binding.unlockSource,
    }),
  );
  if (conn.lastUnlockSource === "prf" && conn.lastPrfRoot) {
    savePrfRootSession(userId, conn.lastPrfRoot);
    await savePrfRootDurable(userId, conn.lastPrfRoot);
  }
  return cacheCustodySession(userId, session);
}
