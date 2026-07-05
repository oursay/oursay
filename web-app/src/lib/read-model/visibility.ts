import type { AuthorVisibility, ViewerContext } from "@/lib/types";

/**
 * Author-visibility resolution (docs/09-ACCOUNT-PRIVACY-MODEL.md, demo scope).
 *
 * Visibility governs the author's identity surface only — name, handle,
 * profile link, avatar seed. The signed civic data (record body, tallies,
 * verification-tier pill, districts, home-author glyph) stays public: those
 * are anonymized civic signals, not identity.
 */

/**
 * Demo linearization of "narrower audience". Real audiences are not strictly
 * nested (e.g. `my_officials` vs `my_district` overlap differently per viewer);
 * a single rank keeps the narrow-only cascade decidable in the demo.
 */
export const VISIBILITY_NARROWNESS: Record<AuthorVisibility, number> = {
  public: 0,
  id_verified: 1,
  my_jurisdiction: 2,
  my_district: 3,
  all_officials: 4,
  my_officials: 5,
  anonymous: 6,
};

/**
 * Cascade: `effective = thread ?? account ?? anonymous`. The account value is
 * only the default; a per-thread override wins outright in either direction
 * (it may widen OR narrow), so posts/replies can set any visibility per thread.
 */
export function resolveVisibility(
  account?: AuthorVisibility | null,
  thread?: AuthorVisibility | null,
): AuthorVisibility {
  return thread ?? account ?? "anonymous";
}

function overlaps(a: string[], b: string[]): boolean {
  return a.some((s) => b.includes(s));
}

/**
 * May this viewer see the identity behind an author with the given effective
 * visibility? `authorDistricts` are the author's home riding slug(s) — [] means
 * a jurisdiction-wide / Global author.
 *
 * Demo approximation for `my_jurisdiction`: a viewer with home districts is an
 * Alberta resident; district-less authors are treated as sharing everyone's
 * jurisdiction (Global).
 */
export function isRevealed(
  visibility: AuthorVisibility,
  authorDistricts: string[],
  viewer: ViewerContext,
): boolean {
  switch (visibility) {
    case "public":
      return true;
    case "id_verified":
      return viewer.kycTier >= 1;
    case "my_jurisdiction":
      return (
        viewer.kycTier >= 2 &&
        (authorDistricts.length === 0 || viewer.viewerDistricts.length > 0)
      );
    case "my_district":
      return viewer.kycTier >= 2 && overlaps(authorDistricts, viewer.viewerDistricts);
    case "all_officials":
      return viewer.kycTier === 3;
    case "my_officials":
      return viewer.kycTier === 3 && overlaps(authorDistricts, viewer.viewerDistricts);
    case "anonymous":
      return false;
  }
}
