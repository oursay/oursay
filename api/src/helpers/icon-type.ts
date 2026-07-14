// Shared dicebear icon_type allowlist for users.profile_details (HTTP: iconType).
// Personas hard-wire initial-face; official seats hard-wire disco — not PATCHable here.

export const USER_ICON_TYPES = [
  "glass",
  "rings",
  "shape-grid",
  "shapes",
  "stripes",
  "thumbs",
  "triangles",
] as const;

export type UserIconType = (typeof USER_ICON_TYPES)[number];

export const DEFAULT_USER_ICON_TYPE: UserIconType = "thumbs";

export function isUserIconType(v: string): v is UserIconType {
  return (USER_ICON_TYPES as readonly string[]).includes(v);
}

/** Normalize stored / inbound value → allowlisted type (invalid/missing → thumbs). */
export function normalizeUserIconType(raw: string | null | undefined): UserIconType {
  if (raw && isUserIconType(raw)) return raw;
  return DEFAULT_USER_ICON_TYPE;
}
