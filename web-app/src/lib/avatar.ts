import { Avatar, Style } from "@dicebear/core";
import botttsNeutral from "@dicebear/styles/bottts-neutral.json";
import disco from "@dicebear/styles/disco.json";
import initialFace from "@dicebear/styles/initial-face.json";
import rings from "@dicebear/styles/rings.json";
import shapeGrid from "@dicebear/styles/shape-grid.json";
import shapes from "@dicebear/styles/shapes.json";
import stripes from "@dicebear/styles/stripes.json";
import thumbs from "@dicebear/styles/thumbs.json";
import triangles from "@dicebear/styles/triangles.json";

/**
 * Deterministic generated avatars (offline SVG data URIs) — DiceBear v10.
 * Personas → initial-face; official seats → disco; unverified accounts →
 * bottts-neutral (hard-wired, not stored); verified → USER_ICON_TYPES (default thumbs).
 * Real accounts seed by handle; personas seed by persona name.
 */

export const PERSONA_ICON_TYPE = "initial-face" as const;
export const OFFICIAL_SEAT_ICON_TYPE = "disco" as const;
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

export const VERIFIED_USER_ICON_TYPES = USER_ICON_TYPES;
export type VerifiedUserIconType = UserIconType;

export const DEFAULT_VERIFIED_USER_ICON_TYPE: UserIconType = "thumbs";

export type IconType =
  | UserIconType
  | typeof PERSONA_ICON_TYPE
  | typeof OFFICIAL_SEAT_ICON_TYPE
  | typeof UNVERIFIED_USER_ICON_TYPE;

/** Hard-wire / Avatar fallback when nothing else applies. */
export const DEFAULT_USER_ICON_TYPE: IconType = UNVERIFIED_USER_ICON_TYPE;

const STYLE_DEFS: Record<IconType, unknown> = {
  "bottts-neutral": botttsNeutral,
  "initial-face": initialFace,
  disco,
  rings,
  "shape-grid": shapeGrid,
  shapes,
  stripes,
  thumbs,
  triangles,
};

const STYLES = new Map<IconType, Style>();
const CACHE = new Map<string, string>();

/** Brand purple ramp (shades 200–950) — DiceBear picks one per seed when supported. */
const BACKGROUND_COLORS = [
  "ddd6fe", // brand-200
  "c4b5fd", // brand-300
  "a78bfa", // brand-400
  "8b5cf6", // brand-500
  "7c3aed", // brand-600
  "6d28d9", // brand-700
  "5b21b6", // brand-800
  "4c1d95", // brand-900
  "2e1065", // brand-950
];

export function isUserIconType(v: string): v is UserIconType {
  return (USER_ICON_TYPES as readonly string[]).includes(v);
}

export const isVerifiedUserIconType = isUserIconType;

export function parseStoredUserIconType(
  raw: string | null | undefined,
): UserIconType | null {
  if (raw && isUserIconType(raw)) return raw;
  return null;
}

/** Unverified → bottts (hard-wire); verified → stored style or thumbs. */
export function effectiveUserIconType(
  raw: string | null | undefined,
  verified: boolean,
): IconType {
  if (!verified) return UNVERIFIED_USER_ICON_TYPE;
  return parseStoredUserIconType(raw) ?? DEFAULT_VERIFIED_USER_ICON_TYPE;
}

/** @deprecated prefer parseStoredUserIconType + effectiveUserIconType */
export function normalizeUserIconType(raw: string | null | undefined): IconType {
  return parseStoredUserIconType(raw) ?? DEFAULT_USER_ICON_TYPE;
}

function styleFor(iconType: IconType): Style {
  let style = STYLES.get(iconType);
  if (!style) {
    style = new Style(STYLE_DEFS[iconType]);
    STYLES.set(iconType, style);
  }
  return style;
}

function resolveIconType(raw: string | null | undefined): IconType {
  if (
    raw === PERSONA_ICON_TYPE ||
    raw === OFFICIAL_SEAT_ICON_TYPE ||
    raw === UNVERIFIED_USER_ICON_TYPE
  ) {
    return raw;
  }
  return parseStoredUserIconType(raw) ?? DEFAULT_USER_ICON_TYPE;
}

export function avatarDataUri(seed: string, iconType?: string | null): string {
  const resolved = resolveIconType(iconType);
  const key = `${resolved}:${seed}`;
  const cached = CACHE.get(key);
  if (cached) return cached;
  const uri = new Avatar(styleFor(resolved), {
    seed,
    backgroundColor: BACKGROUND_COLORS,
  }).toDataUri();
  CACHE.set(key, uri);
  return uri;
}
