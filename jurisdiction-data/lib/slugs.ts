/** Stable district slug from a display name — mirrors @oursay/geo `districtSlug`. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

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
