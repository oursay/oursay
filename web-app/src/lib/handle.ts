/** Matches @oursay/api helpers/handle.ts — letters, digits, underscore; 1–30 chars after @. */

const HANDLE_BODY_RE = /^[A-Za-z0-9_]{1,30}$/;

/** Profile/API wire handle: no leading @. */
export function wireHandle(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const body = raw.trim().replace(/^@/, "");
  return body || undefined;
}

/** User-facing @mention / profile label (wire handle with leading @). */
export function displayHandle(raw: string | null | undefined): string {
  const wire = wireHandle(raw);
  return wire ? `@${wire}` : "";
}

/** Strip a leading @ and return the handle body, or null if invalid. */
export function normalizeHandleBody(raw: string): string | null {
  const body = raw.trim().replace(/^@/, "");
  if (!HANDLE_BODY_RE.test(body)) return null;
  return body;
}

/** User-facing validation message, or null when valid. */
export function handleValidationError(raw: string): string | null {
  const body = raw.trim().replace(/^@/, "");
  if (!body) return "Handle is required.";
  if (body.length > 30) return "Handle must be at most 30 characters.";
  if (!HANDLE_BODY_RE.test(body)) {
    return "Handle must use letters, digits, and underscores only (e.g. jane_alberta).";
  }
  return null;
}
