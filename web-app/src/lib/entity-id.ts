import {
  decodeUuidV4Base59,
  encodeEntityIdForDisplay,
  isUuidV4,
} from "@oursay/encode";

/** @see encodeEntityIdForDisplay */
export const encodeEntityIdForUrl = encodeEntityIdForDisplay;

/**
 * Resolve a URL path segment to the canonical entity id used by the backend API.
 * Accepts Base59 post slugs, legacy raw UUID v4 links, and mock corpus ids unchanged.
 */
export function resolveEntityIdFromUrl(urlSegment: string): string {
  const decoded = decodeURIComponent(urlSegment);
  if (isUuidV4(decoded)) {
    return decoded.toLowerCase();
  }
  try {
    return decodeUuidV4Base59(decoded);
  } catch {
    return decoded;
  }
}
