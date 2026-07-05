import type {
  AuthorVisibility,
  JurisdictionMembership,
  SignAction,
  SignMethod,
  SigningPrefs,
  VerificationTier,
} from "@/lib/types";
import {
  DEFAULT_SIGNING,
  SIGN_ACTIONS,
  SIGN_METHODS,
  VISIBILITY_VALUES,
} from "@/lib/types";

const COOKIE = "oursay-subs";
const SESSION_COOKIE = "oursay-session";
/** Theme preference — persisted independently of auth so it survives logout. */
export const THEME_COOKIE = "oursay-theme";
const SIGNING_COOKIE = "oursay-signing";
/** Per-thread anonymity memory (demo): { [postId]: AuthorVisibility }. */
const THREAD_ANON_COOKIE = "oursay-thread-anon";
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

/** New accounts start signed out, unverified, and anonymous (demo default). */
export const DEFAULT_SESSION: PersistedSession = {
  loggedIn: false,
  kycTier: 0,
  accountVisibility: "anonymous",
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

export type Theme = "light" | "dark";

/** Read the persisted theme, defaulting to light (client-only). */
export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${THEME_COOKIE}=`));
  return match?.slice(THEME_COOKIE.length + 1) === "dark" ? "dark" : "light";
}

/** Persist the theme preference to the cookie (client-only). */
export function writeTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/** Read persisted per-action signing methods, merged over the defaults. */
export function readSigning(): SigningPrefs {
  if (typeof document === "undefined") return DEFAULT_SIGNING;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SIGNING_COOKIE}=`));
  if (!match) return DEFAULT_SIGNING;
  try {
    const parsed = JSON.parse(
      decodeURIComponent(match.slice(SIGNING_COOKIE.length + 1)),
    );
    const next: SigningPrefs = { ...DEFAULT_SIGNING };
    for (const action of SIGN_ACTIONS) {
      const value = parsed?.[action];
      if (SIGN_METHODS.includes(value as SignMethod)) {
        next[action as SignAction] = value as SignMethod;
      }
    }
    return next;
  } catch {
    // Malformed cookie — fall back to the defaults.
  }
  return DEFAULT_SIGNING;
}

/** Persist the signing preferences to the cookie (client-only). */
export function writeSigning(signing: SigningPrefs): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(signing));
  document.cookie = `${SIGNING_COOKIE}=${value}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/**
 * Read remembered per-thread anonymity choices (demo memory). Anonymity is
 * thread-bound, so each post keeps its own chosen visibility across visits.
 */
export function readThreadVisibilities(): Record<string, AuthorVisibility> {
  if (typeof document === "undefined") return {};
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${THREAD_ANON_COOKIE}=`));
  if (!match) return {};
  try {
    const parsed = JSON.parse(
      decodeURIComponent(match.slice(THREAD_ANON_COOKIE.length + 1)),
    );
    if (parsed && typeof parsed === "object") {
      const next: Record<string, AuthorVisibility> = {};
      for (const [postId, v] of Object.entries(parsed)) {
        if (VISIBILITY_VALUES.includes(v as AuthorVisibility)) {
          next[postId] = v as AuthorVisibility;
        }
      }
      return next;
    }
  } catch {
    // Malformed cookie — no remembered choices.
  }
  return {};
}

/** Remember a post's thread anonymity choice (client-only). */
export function writeThreadVisibility(
  postId: string,
  visibility: AuthorVisibility,
): void {
  if (typeof document === "undefined") return;
  const map = { ...readThreadVisibilities(), [postId]: visibility };
  const value = encodeURIComponent(JSON.stringify(map));
  document.cookie = `${THREAD_ANON_COOKIE}=${value}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
