// Email normalization. We store the email as typed AND a single canonical form used for uniqueness
// and every lookup, so "Foo.Bar+tag@Gmail.com" and "foobar@gmail.com" can't register twice
// (gmail-dot / plus-tag aliasing). Canonicalization is intentionally conservative: lower-case +
// trim for all providers, plus dot/+tag folding ONLY for Gmail-family domains.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export interface NormalizedEmail {
  /** The address as the user typed it (after a trim), preserved for display/sending. */
  email: string;
  /** The canonical form: unique key + lookup key. */
  canonical: string;
}

/** Basic shape check — full RFC validation is the transport's job; we just gate obvious garbage. */
export function isPlausibleEmail(raw: string): boolean {
  const v = raw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function normalizeEmail(raw: string): NormalizedEmail {
  const email = raw.trim();
  const at = email.lastIndexOf("@");
  if (at <= 0) return { email, canonical: email.toLowerCase() };

  let local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.toLowerCase();
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    local = local.replace(/\./g, "");
    // All Gmail-family aliases canonicalize onto gmail.com.
    return { email, canonical: `${local}@gmail.com` };
  }

  return { email, canonical: `${local.toLowerCase()}@${domain}` };
}
