import { encodeUuidV4Base59, isUuidV4 } from "./uuid-base59.js";

/**
 * Encode a canonical entity id for human-facing surfaces (URLs, passkey labels, WYSIWYS).
 * UUID v4 values become compact Base59; other opaque ids pass through unchanged.
 */
export function encodeEntityIdForDisplay(entityId: string): string {
  if (isUuidV4(entityId)) {
    return encodeUuidV4Base59(entityId);
  }
  return entityId;
}
