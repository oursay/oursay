const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Matches @oursay/geo districtSlug — year-less riding key from a display name. */
export function districtSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
