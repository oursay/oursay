import type {
  FeedFilterParams,
  GeoFilterMode,
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
 * My Districts, actually engaged: remembered intent AND a residency-verified
 * viewer. Districts are only inferable for Residency+ authors, so an engaged
 * EXCLUSIVE pins the effective Verified floor to Residency (pinnedTierMin) —
 * display and inference follow, the remembered Verified state is untouched.
 */
export function effectiveMyDistricts(
  filter: FeedFilterParams,
  ctx: ViewerContext,
): GeoFilterMode {
  const mode = filter.geography?.myDistricts ?? "off";
  return mode === "off" || ctx.kycTier < 2 ? "off" : mode;
}

/**
 * Affected, actually engaged. Requires post-detail context (`openPost`) — it
 * only ever applies to the ONE open post it was engaged on. NOT a feed/list-wide
 * filter. Same gating (and exclusive Verified pin) as effectiveMyDistricts.
 */
export function effectiveAffected(
  filter: FeedFilterParams,
  ctx: ViewerContext,
  openPost: DistrictBearing | null | undefined,
): GeoFilterMode {
  const mode = filter.geography?.affected ?? "off";
  if (mode === "off" || ctx.kycTier < 2) return "off";
  return openPost == null ? "off" : mode;
}

/**
 * A resident of one of the post's affected districts — mine included when the
 * post affects it (a jurisdiction-wide post affects every district).
 * District-less authors (e.g. officials) are kept, mirroring outsideMyDistricts.
 */
export function isAffectedKeep(
  node: DistrictBearing,
  postDistrictsList: string[],
): boolean {
  const ds = node.districts ?? [];
  if (!ds.length) return true;
  if (!postDistrictsList.length) return true; // jurisdiction-wide: every district is affected
  return ds.some((s) => postDistrictsList.includes(s));
}

/**
 * A POSITIVE Affected match. Unlike isAffectedKeep, district-less nodes do NOT
 * match: inclusive mode only ever ADDS nodes with a known affected-district
 * residency.
 */
export function isAffectedMatch(
  node: DistrictBearing,
  postDistrictsList: string[],
): boolean {
  return (
    (node.districts ?? []).length > 0 &&
    isAffectedKeep(node, postDistrictsList)
  );
}

/** The geography modes actually in force, after gating and conflict resolution. */
export interface ResolvedGeography {
  myDistricts: GeoFilterMode;
  affected: GeoFilterMode;
  /**
   * The side temporarily forced off by an exclusive-vs-exclusive conflict (see
   * resolveGeography). Its remembered mode in state is untouched — clicking its
   * row restores it (retakes priority), and it re-engages on its own as soon as
   * the winning exclusive is cycled away.
   */
  autoDisabled: "myDistricts" | "affected" | null;
  /**
   * The post only relates to my own districts, so Affected ≡ My Districts:
   * the Affected row mirrors My Districts (visual) and My Districts alone
   * carries the inference.
   */
  interlocked: boolean;
}

/**
 * Gates both geography filters, then resolves how they relate on the open post:
 *
 * - Post districts all mine -> interlocked: Affected is the same filter as My
 *   Districts, so it mirrors it and its own mode is not applied.
 * - Post districts disjoint from mine -> two EXCLUSIVES cannot compose (the
 *   sets don't intersect): the side that last entered exclusive
 *   (`geography.priority`) wins and the other is temporarily auto-disabled.
 *   Inclusive modes always survive — they only ever add.
 * - Overlap / jurisdiction-wide -> both apply as-is; exclusives narrow
 *   independently (AND), so "Affected: Only" alongside "My Districts: Only"
 *   simply has no additional effect when My Districts is already narrower.
 */
export function resolveGeography(
  filter: FeedFilterParams,
  ctx: ViewerContext,
  openPost?: DistrictBearing | null,
): ResolvedGeography {
  let myDistricts = effectiveMyDistricts(filter, ctx);
  let affected = effectiveAffected(filter, ctx, openPost);
  let autoDisabled: ResolvedGeography["autoDisabled"] = null;
  let interlocked = false;

  const ds = openPost ? postDistricts(openPost) : null;
  if (ds && ds.length > 0) {
    if (ds.every((s) => ctx.viewerDistricts.includes(s))) {
      interlocked = true;
      affected = "off"; // My Districts carries the identical inference
    } else if (
      outsideMyDistricts(openPost as DistrictBearing, ctx.viewerDistricts) &&
      myDistricts === "exclusive" &&
      affected === "exclusive"
    ) {
      if ((filter.geography?.priority ?? "myDistricts") === "myDistricts") {
        affected = "off";
        autoDisabled = "affected";
      } else {
        myDistricts = "off";
        autoDisabled = "myDistricts";
      }
    }
  }

  return { myDistricts, affected, autoDisabled, interlocked };
}

/**
 * The effective Verified floor: districts are only inferable for Residency+
 * authors, so an engaged exclusive geography pins it to Residency (§4.4).
 * Purely derived — the remembered Verified selection is never mutated and
 * restores as soon as the exclusive is cycled away.
 */
export function pinnedTierMin(
  tierMin: VerificationTier,
  geo: ResolvedGeography,
): VerificationTier {
  const pinned =
    geo.myDistricts === "exclusive" || geo.affected === "exclusive";
  return pinned && tierMin < 2 ? 2 : tierMin;
}

/**
 * Composes the geography modes over a node.
 *
 * Inclusive modes broaden: a positive district match is kept even when the node
 * failed the Verified/Signed refinements (`passesRefine`). Exclusive modes
 * narrow independently (AND) on top of the refinements.
 *
 * When `openPost` is omitted (feed/jurisdiction/district list paths), Affected is
 * never engaged and only My Districts applies. When filtering a record's comment
 * thread, pass the open detail post as `openPost` so Affected can evaluate
 * against the post's affected districts.
 */
export function geographyKeep(
  node: DistrictBearing,
  postDistrictsList: string[],
  ctx: ViewerContext,
  filter: FeedFilterParams,
  passesRefine: boolean,
  openPost?: DistrictBearing | null,
): boolean {
  const geo = resolveGeography(filter, ctx, openPost);

  if (
    geo.myDistricts === "inclusive" &&
    inMyDistricts(node, ctx.viewerDistricts)
  ) {
    return true;
  }
  if (
    geo.affected === "inclusive" &&
    isAffectedMatch(node, postDistrictsList)
  ) {
    return true;
  }

  if (!passesRefine) return false;

  if (
    geo.myDistricts === "exclusive" &&
    outsideMyDistricts(node, ctx.viewerDistricts)
  ) {
    return false;
  }
  if (
    geo.affected === "exclusive" &&
    !isAffectedKeep(node, postDistrictsList)
  ) {
    return false;
  }
  return true;
}
