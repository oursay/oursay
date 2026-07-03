import type {
  AuthorVisibility,
  JurisdictionMembership,
  VerificationTier,
} from "@/lib/types";
import { VISIBILITY_VALUES } from "@/lib/types";

const COOKIE = "oursay-subs";
const SESSION_COOKIE = "oursay-session";
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

/** Remembered session — signed in, KYC tier reached, and profile visibility. */
export interface PersistedSession {
  loggedIn: boolean;
  kycTier: VerificationTier;
  /** Account-default profile visibility (docs/09 cascade base). */
  accountVisibility: AuthorVisibility;
}

/** New accounts start signed out, unverified, and publicly visible (demo default). */
export const DEFAULT_SESSION: PersistedSession = {
  loggedIn: false,
  kycTier: 0,
  accountVisibility: "public",
};

/** Read the persisted session, or the signed-out/unverified default. */
export function readSession(): PersistedSession {
  if (typeof document === "undefined") return DEFAULT_SESSION;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return DEFAULT_SESSION;
  try {
    const parsed = JSON.parse(
      decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)),
    );
    if (
      parsed &&
      typeof parsed.loggedIn === "boolean" &&
      [0, 1, 2, 3].includes(parsed.kycTier)
    ) {
      return {
        loggedIn: parsed.loggedIn,
        kycTier: parsed.kycTier,
        accountVisibility: VISIBILITY_VALUES.includes(parsed.accountVisibility)
          ? parsed.accountVisibility
          : DEFAULT_SESSION.accountVisibility,
      };
    }
  } catch {
    // Malformed cookie — fall back to the default session.
  }
  return DEFAULT_SESSION;
}

/** Persist the session (login + KYC tier) to the cookie (client-only). */
export function writeSession(session: PersistedSession): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(session));
  document.cookie = `${SESSION_COOKIE}=${value}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
