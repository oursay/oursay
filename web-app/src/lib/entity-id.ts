import {
  decodeUuidV4Base59,
  encodeUuidV4Base59,
  isUuidV4,
} from "@oursay/encode";

/**
 * Encode a canonical entity id for URL path segments.
 * UUID v4 values become compact Base59; mock corpus slugs and other opaque ids pass through.
 */
export function encodeEntityIdForUrl(entityId: string): string {
  if (isUuidV4(entityId)) {
    return encodeUuidV4Base59(entityId);
  }
  return entityId;
}

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
