// RegionRef — the serializable geographic reference a thread declares as its stake
// (EntityRules.appliesToRegion). It is pure data: a base ref string, or an and/or/not union of refs.
// The RegionResolver compiles a RegionRef into a concrete Region (see resolveRegionRef); nothing here
// touches PostGIS. Keeping it a small value type lets it ride inside entity content JSON, echo on the
// public read surface, and resolve identically wherever the resolver runs.
//
// Base refs (colon-prefixed strings):
//   "jurisdiction"                 — the whole jurisdiction at asOf (also the absent default upstream)
//   "district:<district_slug>"     — a STABLE seat (year-less); resolves to the revision in force at asOf
//   "revision:<revisionId>"        — a PINNED boundary revision (e.g. "edmonton-strathcona-2019")
//   "region:<presetId>"            — a stored custom/platform region preset
//
// Union: { op: "and" | "or" | "not", refs: RegionRef[] } — boolean composition (no Xor).
//   or  — a point is in the union if it is in ANY child
//   and — … if it is in EVERY child
//   not — … if it is in the bounding jurisdiction but NOT in the (first) child (jurisdiction-bounded
//         negation: not(X) ≡ jurisdiction ∖ X)

export type RegionRefOp = "and" | "or" | "not";

export interface RegionRefUnion {
  op: RegionRefOp;
  refs: RegionRef[];
}

export type RegionRef = string | RegionRefUnion;

/** A parsed base (non-union) ref. `presetId` doubles as the slug/revision id payload. */
export type ParsedBaseRef =
  | { kind: "jurisdiction" }
  | { kind: "district"; slug: string }
  | { kind: "revision"; revisionId: string }
  | { kind: "region"; presetId: string };

/** True for a union node. Narrows `RegionRef` to `RegionRefUnion`. */
export function isRegionRefUnion(ref: RegionRef): ref is RegionRefUnion {
  return typeof ref === "object" && ref !== null && "op" in ref && "refs" in ref;
}

/** Parse a base ref string into its kind + payload. Throws on an unknown prefix or empty payload so a
 *  malformed stake fails loudly at resolve time rather than silently matching nothing. */
export function parseBaseRef(ref: string): ParsedBaseRef {
  if (ref === "jurisdiction") return { kind: "jurisdiction" };
  const sep = ref.indexOf(":");
  if (sep > 0) {
    const prefix = ref.slice(0, sep);
    const payload = ref.slice(sep + 1);
    if (payload.length > 0) {
      if (prefix === "district") return { kind: "district", slug: payload };
      if (prefix === "revision") return { kind: "revision", revisionId: payload };
      if (prefix === "region") return { kind: "region", presetId: payload };
    }
  }
  throw new Error(`Invalid RegionRef: ${JSON.stringify(ref)}`);
}

/** Build the legacy `appliesToDistrictIds` (revision ids) as an equivalent RegionRef: an OR of pinned
 *  revisions. The resolver collapses a pure OR of revisions back to a district_union, so a legacy stake
 *  resolves byte-identically to the pre-RegionRef path. */
export function regionRefFromDistrictIds(districtIds: string[]): RegionRefUnion {
  return { op: "or", refs: districtIds.map((id) => `revision:${id}`) };
}
