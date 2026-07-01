import type {
  FeedFilterParams,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";

/** Anything the geography filters read: a record or comment with district slugs. */
export interface DistrictBearing {
  districts?: string[];
}

/** District slugs on a record/comment ([] when jurisdiction-wide or unknown). */
export function postDistricts(p: DistrictBearing): string[] {
  return p.districts ?? [];
}

/** Does this record/comment name one of the viewer's home ridings? */
export function inMyDistricts(
  p: DistrictBearing,
  viewerDistricts: string[],
): boolean {
  return postDistricts(p).some((s) => viewerDistricts.includes(s));
}

/** Names a district that isn't mine. District-less ones (e.g. officials) are kept. */
export function outsideMyDistricts(
  p: DistrictBearing,
  viewerDistricts: string[],
): boolean {
  return postDistricts(p).length > 0 && !inMyDistricts(p, viewerDistricts);
}

/**
 * A post qualifies for the Affected filter when it names more than one district
 * (multi-district) or none at all (jurisdiction-wide); a single-district post
 * has no "other district" for Affected to mean anything.
 */
export function postQualifiesForAffected(p: DistrictBearing): boolean {
  const ds = postDistricts(p);
  return ds.length === 0 || ds.length > 1;
}

/**
 * A district can only be inferred for Residency/Official authors, so the
 * geography filters are only inferable when the Verified filter sits at
 * Residency (2) or Official (3). Mirrors the wireframe's districtsInferable().
 */
export function districtsInferable(tierMin: VerificationTier): boolean {
  return tierMin >= 2;
}

/**
 * My Districts, actually engaged: remembered intent AND a residency-verified
 * viewer AND districts inferable from the Verified ladder.
 */
export function effectiveMyDistricts(
  filter: FeedFilterParams,
  ctx: ViewerContext,
  tierMin: VerificationTier,
): boolean {
  return (
    !!filter.geography?.myDistricts &&
    ctx.kycTier >= 2 &&
    districtsInferable(tierMin)
  );
}

/**
 * Affected, actually engaged. Requires post-detail context (`openPost`) — it
 * only ever applies to the ONE open post it was engaged on, and only when that
 * post qualifies (multi-district or jurisdiction-wide). Mirrors the wireframe's
 * effectiveAffected() + viewHasAffected(). NOT a feed/list-wide filter.
 */
export function effectiveAffected(
  filter: FeedFilterParams,
  ctx: ViewerContext,
  tierMin: VerificationTier,
  openPost: DistrictBearing | null | undefined,
): boolean {
  return (
    !!filter.geography?.affected &&
    ctx.kycTier >= 2 &&
    districtsInferable(tierMin) &&
    openPost != null &&
    postQualifiesForAffected(openPost)
  );
}

/**
 * A residency-verified resident of one of the post's OTHER named districts (or,
 * for a jurisdiction-wide post, any district) — but never my own. District-less
 * authors (e.g. officials) are kept, mirroring outsideMyDistricts.
 */
export function isAffectedNotMine(
  node: DistrictBearing,
  postDistrictsList: string[],
  viewerDistricts: string[],
): boolean {
  const ds = node.districts ?? [];
  if (!ds.length) return true;
  if (ds.some((s) => viewerDistricts.includes(s))) return false;
  if (!postDistrictsList.length) return true; // jurisdiction-wide post: any other district qualifies
  return ds.some((s) => postDistrictsList.includes(s));
}

/**
 * Composes My Districts and Affected as an OR.
 *
 * When `openPost` is omitted (feed/jurisdiction/district list paths), Affected is
 * never engaged and only My Districts applies. When filtering a record's comment
 * thread, pass the open detail post as `openPost` so Affected can evaluate
 * against the post's other districts. Both filters are coupled to `tierMin` /
 * `kycTier` via districtsInferable().
 */
export function geographyKeep(
  node: DistrictBearing,
  postDistrictsList: string[],
  ctx: ViewerContext,
  filter: FeedFilterParams,
  openPost?: DistrictBearing | null,
): boolean {
  const tierMin = filter.tierMin ?? 0;
  const myOn = effectiveMyDistricts(filter, ctx, tierMin);
  const affOn = effectiveAffected(filter, ctx, tierMin, openPost);
  if (!myOn && !affOn) return true;
  const keepMine = myOn && !outsideMyDistricts(node, ctx.viewerDistricts);
  const keepAff =
    affOn && isAffectedNotMine(node, postDistrictsList, ctx.viewerDistricts);
  return keepMine || keepAff;
}
