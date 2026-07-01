import type { VerificationTier } from "@/lib/types";

/**
 * Initials from a display name: first word + last word, with any ", MLA"-style
 * suffix stripped. Mirrors the wireframe's initials() helper.
 */
export function initials(name: string): string {
  const base = name.split(",")[0].trim().split(/\s+/);
  const first = base[0] ?? "";
  const last = base[base.length - 1] ?? "";
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

/**
 * An author "in my district": only meaningful when the viewer is themselves
 * residency-verified (kycTier >= 2) and the author's riding overlaps one of the
 * viewer's home ridings. Drives the map-pin-house residency-neighbour glyph.
 */
export function isHomeAuthor(
  authorDistricts: string[] | undefined,
  viewerKycTier: VerificationTier,
  viewerDistricts: string[],
): boolean {
  if (viewerKycTier < 2) return false;
  return (authorDistricts ?? []).some((s) => viewerDistricts.includes(s));
}

/** Compact count formatting (e.g. 8300 -> "8.3k"), matching the wireframe fmtN. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
}

/**
 * After an outside-dismiss pointer release, the browser may still synthesize a
 * `click` on whatever now sits under the cursor once the overlay unmounts.
 * Eat only that one stray click — not pointerup/mouseup, which would otherwise
 * survive until the user's next tap and steal it.
 */
export function swallowNextPointerClick() {
  document.addEventListener(
    "click",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    },
    { capture: true, once: true },
  );
}
