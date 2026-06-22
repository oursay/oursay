// Handle + display-name helpers. A `handle` is a unique, optional @username (public profile only):
// a leading `@` followed by 1–30 of [A-Za-z0-9_], no spaces. A `display_name` is optional free-text
// public display; when absent it defaults to the handle WITHOUT the leading `@`. Legal name
// (first/last) is private PII and lives in auth.profiles, never here. See docs/01 §6.0 / the name
// model in the plan.

export const HANDLE_PATTERN = "^@[A-Za-z0-9_]{1,30}$";
const HANDLE_RE = new RegExp(HANDLE_PATTERN);

/**
 * Normalize a raw handle: trim, treat empty as absent, prepend `@` if missing. Returns null when
 * nothing was supplied. Throws nothing — validity is checked separately with {@link isValidHandle}.
 */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t.length === 0) return null;
  return t.startsWith("@") ? t : `@${t}`;
}

/** True if `handle` is a well-formed @username. */
export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}

/** The effective public display name: explicit value, else the handle without its `@`, else null. */
export function displayNameFor(handle: string | null, displayName: string | null): string | null {
  if (displayName && displayName.trim().length > 0) return displayName.trim();
  return handle ? handle.replace(/^@/, "") : null;
}
