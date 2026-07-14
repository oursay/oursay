// Handle + display-name helpers. A `handle` is a unique @username (public profile only):
// stored in wire form (no leading `@`) — 3–30 of [A-Za-z0-9_-] with at least one letter.
// Registration also rejects official seat handles and persona names (see RegistrationService).
// Display layers add `@`. A `display_name` is optional free-text public display; when absent it
// defaults to the wire handle. Legal name (first/last) is private PII and lives in auth.profiles,
// never here. See docs/01 §6.0 / web-app/src/lib/handle.ts (kept in sync).

/**
 * Regex for the wire handle stored in DB and used in URLs (`/profile/{handle}`).
 * Requires ≥1 letter so digit-/underscore-only strings cannot squat persona-like or numeric IDs.
 */
export const HANDLE_WIRE_PATTERN = "^(?=.*[A-Za-z])[A-Za-z0-9_-]{3,30}$";
const HANDLE_WIRE_RE = new RegExp(HANDLE_WIRE_PATTERN);

/** @deprecated Use HANDLE_WIRE_PATTERN — kept for OpenAPI callers that referenced the old @-prefixed pattern. */
export const HANDLE_PATTERN = HANDLE_WIRE_PATTERN;

/**
 * Normalize user/API input to the canonical wire handle (trim, strip a leading `@`).
 * Returns null when empty. Does not validate charset — use {@link isValidHandle}.
 */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const body = raw.trim().replace(/^@/, "");
  return body.length > 0 ? body : null;
}

/** True if `handle` is a well-formed wire username (no `@`). */
export function isValidHandle(handle: string): boolean {
  return HANDLE_WIRE_RE.test(handle);
}

/**
 * User-facing format error for a wire handle (no `@`), or null when valid.
 * Prefer this over a generic "invalid" so clients can show length vs letter vs charset.
 */
export function handleFormatError(handle: string): string | null {
  if (!handle) return "A handle (@username) is required";
  if (handle.length < 3) return "Handle must be at least 3 characters";
  if (handle.length > 30) return "Handle must be at most 30 characters";
  if (!/^[A-Za-z0-9_-]+$/.test(handle)) {
    return "Handle must use letters, digits, hyphens, and underscores only";
  }
  if (!/[A-Za-z]/.test(handle)) return "Handle must contain at least one letter";
  return null;
}

/** Fail fast when a handle is not canonical wire form. Accepts optional leading `@` on input. */
export function requireValidHandle(handle: string): string {
  const wire = normalizeHandle(handle);
  if (!wire || !isValidHandle(wire)) {
    throw new Error(`Invalid handle (expected ${HANDLE_WIRE_PATTERN}): ${JSON.stringify(handle)}`);
  }
  return wire;
}

/** The effective public display name: explicit value, else the wire handle, else null. */
export function displayNameFor(handle: string | null, displayName: string | null): string | null {
  if (displayName && displayName.trim().length > 0) return displayName.trim();
  return handle ? handle.replace(/^@/, "") : null;
}
