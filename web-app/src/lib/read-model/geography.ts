import type {
  AuthorGeoRelation,
  FeedFilterParams,
  GeoFilterMode,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";

/** Anything the geography filters read: a record or comment with district slugs. */
export interface DistrictBearing {
  districts?: string[];
  /** Author tier — lets district-less officials count as jurisdiction residents. */
  tier?: VerificationTier;
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
 * filter. Unlike My Districts it does NOT require a residency-verified viewer:
 * it matches authors against the OPEN POST's affected districts, which are
 * always known, so it is viewer-independent. An engaged EXCLUSIVE still pins the
 * effective Verified floor to Residency (pinnedTierMin) because only Residency+
 * AUTHORS have inferable districts.
 */
export function effectiveAffected(
  filter: FeedFilterParams,
  openPost: DistrictBearing | null | undefined,
): GeoFilterMode {
  const mode = filter.geography?.affected ?? "off";
  if (mode === "off") return "off";
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

/**
 * A post that affects its WHOLE jurisdiction: no named districts, or every
 * jurisdiction district named. There every in-jurisdiction resident is
 * "affected", so the narrower in-jurisdiction distinction carries no signal
 * (affected > jurisdiction) — the My Jurisdiction filter/glyph drops off.
 */
export function jurisdictionWidePost(
  postDistrictsList: string[],
  jurisdictionDistricts: string[],
): boolean {
  return (
    postDistrictsList.length === 0 ||
    (jurisdictionDistricts.length > 0 &&
      jurisdictionDistricts.every((s) => postDistrictsList.includes(s)))
  );
}

/**
 * A resident of the scope's jurisdiction(s) — the My Jurisdiction "Only" keep.
 * The author's RESIDENCE districts decide (callers pass authorDistricts for
 * records; comment nodes carry residence already). District-less tier-3
 * officials are residents of the jurisdiction they represent and are kept;
 * district-less non-officials (an address outside the modeled jurisdictions)
 * are exactly who the filter exists to drop.
 */
export function isJurisdictionKeep(
  node: DistrictBearing,
  jurisdictionDistricts: string[],
): boolean {
  const ds = node.districts ?? [];
  if (ds.length === 0) return node.tier === 3;
  return ds.some((s) => jurisdictionDistricts.includes(s));
}

/**
 * A POSITIVE My Jurisdiction match: inclusive mode only ever ADDS nodes with a
 * known in-jurisdiction residency (mirrors isAffectedMatch — district-less
 * officials pass the tier refinements on their own).
 */
export function isJurisdictionMatch(
  node: DistrictBearing,
  jurisdictionDistricts: string[],
): boolean {
  return (
    (node.districts ?? []).length > 0 &&
    isJurisdictionKeep(node, jurisdictionDistricts)
  );
}

/**
 * My Jurisdiction, actually engaged. Viewer-independent like Affected — it
 * matches AUTHORS against the scope's jurisdiction districts
 * (`geography.jurisdictionDistricts`, resolved by the caller per scope).
 * Gated off when:
 * - the scope includes a district-less jurisdiction (e.g. Global): there it
 *   exactly mirrors Verified: Residency (everyone with an address qualifies);
 * - the open post is jurisdiction-wide: there it exactly mirrors Affected, and
 *   affected > jurisdiction, so this is the side that drops off.
 * An engaged EXCLUSIVE pins the effective Verified floor to Residency
 * (pinnedTierMin) — only Residency+ authors have inferable districts.
 */
export function effectiveMyJurisdiction(
  filter: FeedFilterParams,
  openPost?: DistrictBearing | null,
): GeoFilterMode {
  const mode = filter.geography?.myJurisdiction ?? "off";
  if (mode === "off") return "off";
  const jurDistricts = filter.geography?.jurisdictionDistricts ?? [];
  if (jurDistricts.length === 0) return "off";
  if (openPost && jurisdictionWidePost(postDistricts(openPost), jurDistricts)) {
    return "off";
  }
  return mode;
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

/** Inputs for resolving a Residency author's spatial relation to the open post. */
export interface AuthorGeoContext {
  /** The post's affected riding slugs; [] means jurisdiction-wide. */
  postDistricts: string[];
  /** Every riding slug in the post's jurisdiction; [] for a district-less one (e.g. Global). */
  jurisdictionDistricts: string[];
  /** Viewer's home ridings (empty unless residency-verified). */
  viewerDistricts: string[];
  /** Viewer's KYC tier — the "home" relation only resolves for a residency-verified viewer. */
  viewerKycTier: VerificationTier;
}

/**
 * A Residency author's spatial relation to the open post, resolved
 * most-specific-first so the pill glyph escalates predictably:
 *
 *   home  >  affected  >  jurisdiction  >  none
 *
 * PRIVACY: this runs at the API boundary (the mock's "server side"). A
 * member's raw districts are never serialized to other members — DTOs carry
 * only this narrowest-relation projection (see AuthorGeoRelation in lib/types).
 *
 * - "home"         lives in one of the VIEWER's home ridings (needs a
 *                  residency-verified viewer). Viewer-centric and
 *                  post-independent, so it always outranks the rest.
 * - "affected"     lives in one of the post's affected ridings.
 * - "jurisdiction" lives elsewhere in the post's jurisdiction — allowed to
 *                  participate, but outside the affected area.
 * - "none"         residency-verified with no contextual tie (district-less,
 *                  e.g. officials, or a resident of another jurisdiction).
 *
 * Drop-off — a distinction that would hold for everyone carries no signal, so
 * it collapses toward the next rung. Only ONE of the pair ever drops:
 * - Jurisdiction-wide post (no affected ridings, or every riding affected): the
 *   whole jurisdiction is genuinely affected, so every in-jurisdiction resident
 *   is "affected" and the narrower "jurisdiction" relation can't exist — it is
 *   the one that drops off (affected outranks jurisdiction). District-less and
 *   other-jurisdiction authors still fall through to "none".
 * - Post whose affected ridings are all mine (interlocked): an "affected but not
 *   home" author is impossible, so "affected" folds into "home" on its own — no
 *   special-casing needed here, the precedence handles it.
 *
 * Tier gating is the caller's job: only Residency (tier 2) shows a geo glyph.
 */
export function authorGeoRelation(
  authorDistricts: string[] | undefined,
  ctx: AuthorGeoContext,
): AuthorGeoRelation {
  const ds = authorDistricts ?? [];
  if (ds.length === 0) return "none";

  if (isHomeAuthor(ds, ctx.viewerKycTier, ctx.viewerDistricts)) {
    return "home";
  }

  const inJurisdiction = ds.some((s) => ctx.jurisdictionDistricts.includes(s));

  if (jurisdictionWidePost(ctx.postDistricts, ctx.jurisdictionDistricts)) {
    // Whole jurisdiction affected -> in-jurisdiction residents are "affected";
    // the narrower "jurisdiction" relation drops off.
    return inJurisdiction ? "affected" : "none";
  }

  if (ds.some((s) => ctx.postDistricts.includes(s))) return "affected";
  if (inJurisdiction) return "jurisdiction";

  return "none";
}

/** The geography modes actually in force, after gating and conflict resolution. */
export interface ResolvedGeography {
  myDistricts: GeoFilterMode;
  affected: GeoFilterMode;
  myJurisdiction: GeoFilterMode;
  /**
   * The side temporarily forced off by an exclusive-vs-exclusive conflict (see
   * resolveGeography). Its remembered mode in state is untouched — clicking its
   * row restores it (retakes priority), and it re-engages on its own as soon as
   * the winning exclusive is cycled away. myJurisdiction is never here: its
   * population is a superset of both others, so exclusives always compose.
   */
  autoDisabled: "myDistricts" | "affected" | null;
  /**
   * The post only relates to my own districts, so Affected ≡ My Districts:
   * the Affected row mirrors My Districts (visual) and My Districts alone
   * carries the inference.
   */
  interlocked: boolean;
  /**
   * Display-only: the My Districts population is already covered by an engaged
   * broader filter (Affected on a post affecting my district, or My
   * Jurisdiction when my districts are in the scope's jurisdiction) — the row
   * (state off) shows Include while the broader filter carries the inference.
   */
  myDistrictsImplied: boolean;
  /**
   * Display-only: My Jurisdiction is engaged, so the Affected population
   * (a subset of in-jurisdiction residents) is covered — the Affected row
   * (state off) shows Include.
   */
  affectedImplied: boolean;
  /**
   * Display-only: a narrower exclusive (Affected/My Districts: Only) is
   * engaged, so "only in-jurisdiction authors" already holds — the My
   * Jurisdiction row (state off) shows Only.
   */
  jurisdictionImplied: boolean;
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
 * - Overlap (post affects mine among others) -> both apply; exclusives narrow
 *   independently (AND), so "Affected: Only" alongside "My Districts: Only"
 *   simply has no additional effect when My Districts is already narrower.
 * - Jurisdiction-wide -> both apply as-is.
 *
 * Display-only implications (the `*Implied` flags) then run over the resolved
 * modes: a row whose population an engaged broader filter already covers shows
 * Include; a row whose "Only" constraint an engaged narrower exclusive already
 * enforces shows Only. Remembered state is untouched — cycling starts from the
 * shown mode (see the cycle handlers in lib/state).
 */
export function resolveGeography(
  filter: FeedFilterParams,
  ctx: ViewerContext,
  openPost?: DistrictBearing | null,
): ResolvedGeography {
  let myDistricts = effectiveMyDistricts(filter, ctx);
  let affected = effectiveAffected(filter, openPost);
  const myJurisdiction = effectiveMyJurisdiction(filter, openPost);
  let autoDisabled: ResolvedGeography["autoDisabled"] = null;
  let interlocked = false;
  let myDistrictsImplied = false;
  let affectedImplied = false;
  let jurisdictionImplied = false;

  const jurDistricts = filter.geography?.jurisdictionDistricts ?? [];
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

    if (
      myDistricts === "off" &&
      autoDisabled !== "myDistricts" &&
      ((affected !== "off" &&
        inMyDistricts(openPost as DistrictBearing, ctx.viewerDistricts)) ||
        (myJurisdiction !== "off" &&
          ctx.viewerDistricts.some((s) => jurDistricts.includes(s))))
    ) {
      myDistrictsImplied = true;
    }
    if (
      affected === "off" &&
      !interlocked &&
      autoDisabled !== "affected" &&
      myJurisdiction !== "off"
    ) {
      affectedImplied = true;
    }
    if (
      myJurisdiction === "off" &&
      jurDistricts.length > 0 &&
      !jurisdictionWidePost(ds, jurDistricts) &&
      (affected === "exclusive" || myDistricts === "exclusive")
    ) {
      jurisdictionImplied = true;
    }
  }

  return {
    myDistricts,
    affected,
    myJurisdiction,
    autoDisabled,
    interlocked,
    myDistrictsImplied,
    affectedImplied,
    jurisdictionImplied,
  };
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
    geo.myDistricts === "exclusive" ||
    geo.affected === "exclusive" ||
    geo.myJurisdiction === "exclusive";
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
  if (
    geo.myJurisdiction === "inclusive" &&
    isJurisdictionMatch(node, filter.geography?.jurisdictionDistricts ?? [])
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
  if (
    geo.myJurisdiction === "exclusive" &&
    !isJurisdictionKeep(node, filter.geography?.jurisdictionDistricts ?? [])
  ) {
    return false;
  }
  return true;
}
