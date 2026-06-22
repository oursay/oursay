// Address normalization (Canada-centric storage; FE owns localized labels). No district/riding
// derivation here (deliberately): boundaries shift over time and arbitrary boundaries leak PII, so
// district/region membership is resolved dynamically against platform-defined boundaries — never
// baked onto the stored profile.

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

/** Canadian postal codes uppercased to "A1A 1A1"; others uppercased + space-collapsed. */
export function normalizePostal(postal: string | null, country: string): string | null {
  if (postal == null) return null;
  const compact = postal.replace(/\s+/g, "").toUpperCase();
  if (country === "CA" && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  return postal.trim().replace(/\s+/g, " ").toUpperCase();
}
