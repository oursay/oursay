// Compact UUID ↔ Base59 for explorer URL path segments (`/v1/explorer/.../tx/:txId`).
// Storage stays UUID v4; public explorer paths and response ids use @oursay/encode Base59.

import {
  decodeUuidV4Base59,
  encodeUuidV4Base59,
  isUuidV4,
  normalizeUuid,
} from "@oursay/encode";

/** Encode a stored UUID (or pass through non-UUID opaque ids) for explorer URLs / JSON. */
export function encodeExplorerId(id: string): string {
  if (isUuidV4(id)) return encodeUuidV4Base59(id);
  return id;
}

/**
 * Accept Base59 explorer ids or hyphenated UUID v4. Throws on invalid input
 * (caller maps to ServiceError validation).
 */
export function decodeExplorerId(raw: string): string {
  const trimmed = raw.trim();
  if (isUuidV4(trimmed)) return normalizeUuid(trimmed);
  return decodeUuidV4Base59(trimmed);
}
