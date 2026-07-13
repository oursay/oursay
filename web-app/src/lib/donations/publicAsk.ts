/**
 * First-visit public donation soft-ask timing (localStorage).
 * Cooldown is recorded when the visitor **closes** the modal (not on open).
 */

export const PUBLIC_DONATION_STORAGE_KEY = "oursay.donation.public.lastShown";
export const PUBLIC_DONATION_DELAY_MS = 30_000;

/** Production: 24h. Development: 5 minutes (faster re-test). */
export const PUBLIC_DONATION_COOLDOWN_MS_PROD = 24 * 60 * 60 * 1000;
export const PUBLIC_DONATION_COOLDOWN_MS_DEV = 5 * 60 * 1000;

export function publicDonationCooldownMs(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): number {
  return nodeEnv === "development"
    ? PUBLIC_DONATION_COOLDOWN_MS_DEV
    : PUBLIC_DONATION_COOLDOWN_MS_PROD;
}

/** @deprecated Use publicDonationCooldownMs() — kept name for call sites that want the active value. */
export const PUBLIC_DONATION_COOLDOWN_MS = publicDonationCooldownMs();

export function shouldOfferPublicDonationAsk(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PUBLIC_DONATION_STORAGE_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return now - last >= publicDonationCooldownMs();
  } catch {
    return true;
  }
}

/** Call when the public donation modal is dismissed (I'll donate next time / X). */
export function markPublicDonationAskShown(now = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PUBLIC_DONATION_STORAGE_KEY, String(now));
  } catch {
    // private mode / blocked storage — ignore
  }
}
