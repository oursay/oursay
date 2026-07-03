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

export function avatarDataUri(seed: string): string {
  const cached = CACHE.get(seed);
  if (cached) return cached;
  const uri = new Avatar(STYLE, { seed }).toDataUri();
  CACHE.set(seed, uri);
  return uri;
}
