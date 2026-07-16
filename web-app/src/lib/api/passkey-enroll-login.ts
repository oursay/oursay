/**
 * Bridge between passkey enrollment and the immediate follow-up login.
 *
 * On Chrome for Android, Google Password Manager can lag briefly after create()
 * before the new credential is usable in get() — especially for usernameless
 * (empty allowCredentials) assertions. A short settle + one discovery-only retry
 * covers that without re-running registration.
 */

import { ApiError } from "./client";

/** Pause after /register/verify before opening the auth sheet. */
export const POST_ENROLL_SETTLE_MS = 400;
/** Extra wait before a single login retry when the first assertion looks like discovery lag. */
export const POST_ENROLL_RETRY_DELAY_MS = 900;

function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    return `${err.code ?? ""} ${err.message}`.toLowerCase();
  }
  if (err instanceof Error) return err.message.toLowerCase();
  return String(err).toLowerCase();
}

/**
 * True when the failure looks like "new passkey not yet usable / not found",
 * not an intentional user abort of the auth sheet.
 */
export function isPasskeyDiscoveryFailure(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "AbortError") return false;
    // Android Chrome often surfaces missing/unavailable credentials as NotAllowedError.
    if (err.name === "NotAllowedError" || err.name === "InvalidStateError") return true;
  }
  const msg = errorText(err);
  // Our own cancel path in authenticateWithPrfProbe — do not retry.
  if (msg.includes("passkey authentication cancelled")) return false;
  return (
    msg.includes("unknown credential") ||
    msg.includes("passkey_verification_failed") ||
    msg.includes("no credentials") ||
    msg.includes("no passkey") ||
    msg.includes("not allowed") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("operation either timed out")
  );
}

export type PostEnrollLoginSettleOpts = {
  settleMs?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Run `login` after a short settle; on a discovery-style failure, wait once more and retry login only.
 */
export async function withPostEnrollLoginSettle<T>(
  login: () => Promise<T>,
  opts: PostEnrollLoginSettleOpts = {},
): Promise<T> {
  const settleMs = opts.settleMs ?? POST_ENROLL_SETTLE_MS;
  const retryDelayMs = opts.retryDelayMs ?? POST_ENROLL_RETRY_DELAY_MS;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  if (settleMs > 0) await sleep(settleMs);
  try {
    return await login();
  } catch (e) {
    if (!isPasskeyDiscoveryFailure(e)) throw e;
    if (retryDelayMs > 0) await sleep(retryDelayMs);
    return await login();
  }
}
