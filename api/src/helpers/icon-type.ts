// Shared dicebear icon_type allowlist for users.profile_details (HTTP: iconType).
// Personas hard-wire initial-face; official seats hard-wire disco — not PATCHable here.
//
// Unverified accounts are locked to bottts-neutral (display + PATCH).
// Verified accounts may choose any VERIFIED_USER_ICON_TYPES style (and may keep bottts-neutral).

export const UNVERIFIED_USER_ICON_TYPE = "bottts-neutral" as const;

export const VERIFIED_USER_ICON_TYPES = [
  "thumbs",
  "rings",
  "shape-grid",
  "shapes",
  "stripes",
  "triangles",
] as const;

export type VerifiedUserIconType = (typeof VERIFIED_USER_ICON_TYPES)[number];

export const USER_ICON_TYPES = [
  UNVERIFIED_USER_ICON_TYPE,
  ...VERIFIED_USER_ICON_TYPES,
] as const;

export type UserIconType = (typeof USER_ICON_TYPES)[number];

export const DEFAULT_USER_ICON_TYPE: UserIconType = UNVERIFIED_USER_ICON_TYPE;

export function isVerifiedUserIconType(v: string): v is VerifiedUserIconType {
  return (VERIFIED_USER_ICON_TYPES as readonly string[]).includes(v);
}

export function isUserIconType(v: string): v is UserIconType {
  return (USER_ICON_TYPES as readonly string[]).includes(v);
}

/** Normalize stored value → allowlisted type (invalid/missing → bottts-neutral). */
export function normalizeUserIconType(raw: string | null | undefined): UserIconType {
  if (raw && isUserIconType(raw)) return raw;
  return DEFAULT_USER_ICON_TYPE;
}

/**
 * Style shown on public surfaces for this account.
 * Unverified always bottts-neutral; verified uses stored allowlisted value.
 */
export function effectiveUserIconType(
  raw: string | null | undefined,
  verified: boolean,
): UserIconType {
  if (!verified) return UNVERIFIED_USER_ICON_TYPE;
  return normalizeUserIconType(raw);
}

/** Whether PATCH may set this iconType for the account's current verification state. */
export function canChooseUserIconType(iconType: string, verified: boolean): boolean {
  if (!isUserIconType(iconType)) return false;
  if (!verified) return iconType === UNVERIFIED_USER_ICON_TYPE;
  return true;
}
