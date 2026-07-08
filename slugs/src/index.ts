// @oursay/slugs — shared naming primitives with ZERO runtime dependencies.
//
// This package is the monorepo's dependency FLOOR (below @oursay/geo). The dependency chain is
// jurisdiction-data → public-record → geo, so slug/seat logic cannot live in jurisdiction-data and
// be imported "down" into geo without a cycle. Putting it here lets geo, public-record,
// jurisdiction-data, and web-app all consume ONE source, imported upward.
//
// Node `.mjs` build scripts that cannot import TypeScript keep a small mirror copy; those mirrors
// are guarded against drift by web-app/src/lib/mock/slug.test.ts. If you change an algorithm here,
// update the .mjs mirrors and the drift-guard fixtures too.

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g"); // accents after NFD decomposition

/** Stable, year-less district slug from a display name: strip diacritics, lowercase, collapse
 *  non-alphanumerics to single dashes. "Lac Ste. Anne-Parkland" → "lac-ste-anne-parkland". */
export function districtSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Compact district key for official seat handles, e.g. edmonton-strathcona → edm_strth. */
export function districtShortSlug(districtSlugValue: string): string {
  const parts = districtSlugValue.split("-");
  return parts
    .map((part, index) => abbrevSegment(part, index === parts.length - 1))
    .join("_");
}

function abbrevSegment(part: string, isLast: boolean): string {
  if (part.length <= 4) return part;
  const head = part.slice(0, 3);
  if (!isLast || part.length <= 7) return head;
  const tail = part
    .slice(3)
    .replace(/[aeiou]/gi, "")
    .slice(0, 2);
  return head + tail;
}

/** Jurisdiction-wide leader seat, e.g. ab-premier. */
export function jurisdictionLeaderSeatHandle(jurisdictionShortSlug: string, role: string): string {
  return `${jurisdictionShortSlug}-${role}`;
}

/** District MLA seat, e.g. ab-edm_strth. */
export function districtSeatHandle(jurisdictionShortSlug: string, districtSlugValue: string): string {
  return `${jurisdictionShortSlug}-${districtShortSlug(districtSlugValue)}`;
}

export type OfficialSeatKind = "jurisdiction_leader" | "district_mla";

/** Public-facing seat title derived from the seat's kind + leader-role key. Callers that carry an
 *  explicit title override should prefer it (`entry.title ?? seatTitle(entry)`). */
export function seatTitle(seat: { seatKind: OfficialSeatKind; leaderRole?: string | null }): string {
  if (seat.seatKind === "district_mla") return "District MLA";
  if (seat.leaderRole === "premier") return "Alberta Premier";
  if (seat.leaderRole === "platform") return GLOBAL_PLATFORM_LEADER_LINE;
  return "Jurisdiction Leader";
}

/** Display line for the global (oursay-global) jurisdiction leader — role · jurisdiction. */
export const GLOBAL_PLATFORM_LEADER_LINE = "Platform · Global";

/** Shared identity of the oursay-global platform leader seat. Each layer builds its own typed
 *  record (geo catalog entry / jurisdiction-data OfficialSeatRecord) from these constants so the
 *  seat's handle, name, role line, and claimed holder are defined exactly once. */
export const GLOBAL_PLATFORM_SEAT = {
  seatHandle: jurisdictionLeaderSeatHandle("global", "platform"),
  seatKind: "jurisdiction_leader",
  jurisdictionId: "oursay-global",
  jurisdictionShortSlug: "global",
  name: "OurSay Stewards",
  leaderRole: "platform",
  role: GLOBAL_PLATFORM_LEADER_LINE,
  title: GLOBAL_PLATFORM_LEADER_LINE,
  claimedUserHandle: "oursay",
} as const;
