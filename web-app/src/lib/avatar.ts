import { Avatar, Style } from "@dicebear/core";
import initialFace from "@dicebear/styles/initial-face.json";

/**
 * Deterministic generated avatars (offline SVG data URIs) — DiceBear v10,
 * `initial-face` style. Real accounts seed by handle; per-thread personas seed
 * by the persona name, so an anonymized author's avatar leaks nothing about
 * their real identity and stays stable within a thread. DiceBear is isolated
 * behind this module so the style (or library) can be swapped in one place.
 */

const STYLE = new Style(initialFace);
const CACHE = new Map<string, string>();

/** Brand purple ramp (shades 200–950) — DiceBear picks one per seed. */
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

export function avatarDataUri(seed: string): string {
  const cached = CACHE.get(seed);
  if (cached) return cached;
  const uri = new Avatar(STYLE, {
    seed,
    backgroundColor: BACKGROUND_COLORS,
  }).toDataUri();
  CACHE.set(seed, uri);
  return uri;
}
