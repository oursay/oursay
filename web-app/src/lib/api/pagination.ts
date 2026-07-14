/** Default page size for feed and profile tab lists. */
export const PAGE_SIZE = 25;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  /**
   * Full size of the filtered list (browse-list `page.total` convention).
   * Present on feed responses; optional for local/profile pagination.
   */
  total?: number;
}

/** Slice a local array into cursor pages (mock mode and bundled profile tabs). */
export function sliceLocalPage<T>(
  all: T[],
  cursor: string | null | undefined,
  limit = PAGE_SIZE,
): CursorPage<T> {
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const start = Number.isFinite(offset) ? offset : 0;
  const page = all.slice(start, start + limit);
  const next = start + limit < all.length ? String(start + limit) : null;
  return { items: page, nextCursor: next, total: all.length };
}
