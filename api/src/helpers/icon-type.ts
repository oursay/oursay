// Shared dicebear icon_type for users.profile_details (HTTP: iconType).
// Personas are client hard-wires from civic tier (unverified → bottts, verified →
// initial-face); official seats hard-wire disco; unverified users hard-wire
// bottts-neutral — none of those are stored or PATCHable.
//
// Stored / PATCH-able allowlist is verified styles only (default thumbs when verified + unset).

export const UNVERIFIED_USER_ICON_TYPE = "bottts-neutral" as const;

/** Choosable + storable styles (verified / official accounts only). */
export const USER_ICON_TYPES = [
  "thumbs",
  "rings",
  "shape-grid",
  "shapes",
  "stripes",
  "triangles",
] as const;

export type UserIconType = (typeof USER_ICON_TYPES)[number];

/** @deprecated alias — same as USER_ICON_TYPES */
export const VERIFIED_USER_ICON_TYPES = USER_ICON_TYPES;
export type VerifiedUserIconType = UserIconType;

export const DEFAULT_VERIFIED_USER_ICON_TYPE: UserIconType = "thumbs";

/** Styles that may appear on the wire after effective resolution (includes hard-wires). */
export const WIRE_USER_ICON_TYPES = [
  UNVERIFIED_USER_ICON_TYPE,
  ...USER_ICON_TYPES,
] as const;

export type WireUserIconType = (typeof WIRE_USER_ICON_TYPES)[number];

export function isUserIconType(v: string): v is UserIconType {
  return (USER_ICON_TYPES as readonly string[]).includes(v);
}

export const isVerifiedUserIconType = isUserIconType;

/** Parse stored profile_details.icon_type → allowlisted style or null (never bottts). */
export function parseStoredUserIconType(
  raw: string | null | undefined,
): UserIconType | null {
  if (raw && isUserIconType(raw)) return raw;
  return null;
}

/**
 * Style shown on public surfaces.
 * Unverified → hard-wired bottts-neutral (storage stays null).
 * Verified/official → stored style, else thumbs.
 */
export function effectiveUserIconType(
  raw: string | null | undefined,
  verified: boolean,
): WireUserIconType {
  if (!verified) return UNVERIFIED_USER_ICON_TYPE;
  return parseStoredUserIconType(raw) ?? DEFAULT_VERIFIED_USER_ICON_TYPE;
}

/** PATCH may set this iconType only when the account is verified/official. */
export function canChooseUserIconType(iconType: string, verified: boolean): boolean {
  return verified && isUserIconType(iconType);
}
