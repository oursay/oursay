// Address normalization (Canada-centric storage; FE owns localized labels). No district/riding
// derivation here (deliberately): boundaries shift over time and arbitrary boundaries leak PII, so
// district/region membership is resolved dynamically against platform-defined boundaries — never
// baked onto the stored profile.

import { createHash } from "node:crypto";

export interface AddressInput {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  memo?: string | null;
}

export interface NormalizedAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  memo: string | null;
}

function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Trim fields, default country to CA, and normalize postal codes (upper-case, single-spaced). */
export function normalizeAddress(input: AddressInput): NormalizedAddress {
  const country = (clean(input.country) ?? "CA").toUpperCase();
  return {
    line1: clean(input.line1),
    line2: clean(input.line2),
    city: clean(input.city),
    province: clean(input.province),
    postalCode: normalizePostal(clean(input.postalCode), country),
    country,
    memo: clean(input.memo),
  };
}

/** True when a normalized address carries enough signal to attempt geocoding: a postal code, or a
 *  street line with a city and province. Country-gating (Canada-only) is applied by the caller. */
export function hasGeocodableAddress(addr: NormalizedAddress): boolean {
  if (addr.postalCode) return true;
  return Boolean(addr.line1 && addr.city && addr.province);
}

/** Stable content hash of a normalized address — the geocode cache key / invalidation signal. Uses a
 *  fixed field order (not JSON key order) and an escaped unit-separator delimiter, so the hash is
 *  deterministic across runs and changes iff a normalized field changes. */
export function hashAddress(addr: NormalizedAddress): string {
  const SEP = String.fromCharCode(0x1f); // unit separator — field delimiter (never typed by users)
  const fields = [addr.line1, addr.line2, addr.city, addr.province, addr.postalCode, addr.country, addr.memo];
  // Escape backslash and the separator inside each field so distinct field sets can never collide,
  // then join the fields on that separator.
  const canonical = fields
    .map((f) => (f ?? "").replace(/\\/g, "\\\\").replace(new RegExp(SEP, "g"), "\\u001f"))
    .join(SEP);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Canadian postal codes uppercased to "A1A 1A1"; others uppercased + space-collapsed. */
export function normalizePostal(postal: string | null, country: string): string | null {
  if (postal == null) return null;
  const compact = postal.replace(/\s+/g, "").toUpperCase();
  if (country === "CA" && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  return postal.trim().replace(/\s+/g, " ").toUpperCase();
}
