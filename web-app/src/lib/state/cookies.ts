import type { JurisdictionMembership } from "@/lib/types";

const COOKIE = "oursay-subs";
const MAX_AGE = 60 * 60 * 24 * 365; // one year

/** Logged-out default — Global only (works without an account, like the wireframe). */
export const DEFAULT_SUBSCRIPTIONS: JurisdictionMembership[] = [
  { name: "Global", included: true },
];

/** Read persisted subscriptions, or Global-only when no cookie is set. */
export function readSubscriptions(): JurisdictionMembership[] {
  if (typeof document === "undefined") return DEFAULT_SUBSCRIPTIONS;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE}=`));
  if (!match) return DEFAULT_SUBSCRIPTIONS;
  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(COOKIE.length + 1)));
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as JurisdictionMembership[];
    }
  } catch {
    // Malformed cookie — fall back to the default set.
  }
  return DEFAULT_SUBSCRIPTIONS;
}

/** Persist the subscription list to the cookie (client-only). */
export function writeSubscriptions(subs: JurisdictionMembership[]): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(subs));
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
