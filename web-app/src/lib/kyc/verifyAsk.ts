/**
 * Logged-in Get Verified soft-ask timing (localStorage).
 * Cooldown is recorded when the ask **opens** (once per cooldown window).
 * Only offered to unverified accounts (kycTier === 0) — gated by the caller.
 */

export const VERIFY_ASK_STORAGE_KEY = "oursay.verify.ask.lastShown";

/** Production: 24h. Development: 5 minutes (faster re-test). */
export const VERIFY_ASK_COOLDOWN_MS_PROD = 24 * 60 * 60 * 1000;
export const VERIFY_ASK_COOLDOWN_MS_DEV = 5 * 60 * 1000;

/** Brief settle after login / hydrate so auth chrome can dismiss. */
export const VERIFY_ASK_DELAY_MS = 800;

export function verifyAskCooldownMs(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): number {
  return nodeEnv === "development"
    ? VERIFY_ASK_COOLDOWN_MS_DEV
    : VERIFY_ASK_COOLDOWN_MS_PROD;
}

export function shouldOfferVerifyAsk(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(VERIFY_ASK_STORAGE_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return now - last >= verifyAskCooldownMs();
  } catch {
    return true;
  }
}

/** Call when the soft-ask opens Get Verified. */
export function markVerifyAskShown(now = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VERIFY_ASK_STORAGE_KEY, String(now));
  } catch {
    // private mode / blocked storage — ignore
  }
}
