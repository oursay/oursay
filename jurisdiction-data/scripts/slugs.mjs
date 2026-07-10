/** Node-ESM MIRROR of @oursay/slugs (the shared source of truth) for the pull script, which runs
 *  under plain node and cannot import the TypeScript package. Keep in sync with @oursay/slugs;
 *  web-app/src/lib/mock/slug.test.ts guards the algorithm against drift. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function districtSlug(name) {
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function districtShortSlug(districtSlugValue) {
  const parts = districtSlugValue.split("-");
  return parts
    .map((part, index) => abbrevSegment(part, index === parts.length - 1))
    .join("_");
}

function abbrevSegment(part, isLast) {
  if (part.length <= 4) return part;
  const head = part.slice(0, 3);
  if (!isLast || part.length <= 7) return head;
  const tail = part
    .slice(3)
    .replace(/[aeiou]/gi, "")
    .slice(0, 2);
  return head + tail;
}

export function jurisdictionLeaderSeatHandle(jurisdictionShortSlug, role) {
  return `${jurisdictionShortSlug}-${role}`;
}

export function districtSeatHandle(jurisdictionShortSlug, districtSlugValue) {
  return `${jurisdictionShortSlug}-${districtShortSlug(districtSlugValue)}`;
}
