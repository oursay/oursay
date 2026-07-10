// Compact UUID v4 ↔ Base59 for URL-safe post IDs.
//
// Encoding: drop hyphens → drop version nibble (char 12) → strip leading `0` hex digits
// → Base59. Decoding reverses those steps and validates v4 layout + variant bits.

import {
  decodeHexBase59,
  encodeHexBase59,
  hexToBigInt,
  stripLeadingZeroHex,
} from "./base59.js";

const HEX_PATTERN = /^[0-9a-fA-F]*$/;

/** RFC 4122 UUID v4 with standard hyphen grouping. */
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Hex payload length after the version nibble is removed (32 − 1). */
export const UUID_V4_PAYLOAD_HEX_LENGTH = 31;

/** Index of the version nibble in a 32-char hyphenless UUID hex string. */
export const UUID_V4_VERSION_NIBBLE_INDEX = 12;

const UUID_V4_VERSION_NIBBLE = "4";

/** Lowercase a UUID string for canonical comparisons. */
export function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase();
}

/** True when `uuid` matches RFC 4122 UUID v4 layout (version + variant bits). */
export function isUuidV4(uuid: string): boolean {
  return UUID_V4_PATTERN.test(normalizeUuid(uuid));
}

/** Parse and validate a UUID v4; returns 32 lowercase hex digits without hyphens. */
export function uuidToHex(uuid: string): string {
  const normalized = normalizeUuid(uuid);
  if (!isUuidV4(normalized)) {
    throw new Error("expected a UUID v4");
  }
  return normalized.replace(/-/g, "");
}

/** Format 32 lowercase hex digits as a hyphenated UUID. */
export function hexToUuid(hex: string): string {
  const normalized = hex.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error("hex must be exactly 32 lowercase hex digits");
  }
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}

/** Remove the version nibble from hyphenless UUID hex (31 payload digits). */
export function stripUuidVersionNibble(hex32: string): string {
  if (!/^[0-9a-f]{32}$/.test(hex32)) {
    throw new Error("hex must be exactly 32 lowercase hex digits");
  }
  return (
    hex32.slice(0, UUID_V4_VERSION_NIBBLE_INDEX) +
    hex32.slice(UUID_V4_VERSION_NIBBLE_INDEX + 1)
  );
}

/** Re-insert the v4 version nibble into a 31-digit payload. */
export function insertUuidVersionNibble(payload31: string): string {
  if (!/^[0-9a-f]{31}$/.test(payload31)) {
    throw new Error("payload must be exactly 31 lowercase hex digits");
  }
  return (
    payload31.slice(0, UUID_V4_VERSION_NIBBLE_INDEX) +
    UUID_V4_VERSION_NIBBLE +
    payload31.slice(UUID_V4_VERSION_NIBBLE_INDEX)
  );
}

/**
 * Encode a UUID v4 as a compact Base59 string for URL slugs.
 * Hyphens and the version nibble are omitted; leading `0` hex digits are stripped.
 */
export function encodeUuidV4Base59(uuid: string): string {
  const hex32 = uuidToHex(uuid);
  const payload = stripUuidVersionNibble(hex32);
  return encodeHexBase59(payload);
}

/**
 * Decode a compact Base59 post ID back to a canonical lowercase UUID v4.
 * Throws when the result is not a valid UUID v4.
 */
export function decodeUuidV4Base59(encoded: string): string {
  const payload = decodeHexBase59(encoded, UUID_V4_PAYLOAD_HEX_LENGTH);
  const hex32 = insertUuidVersionNibble(payload);
  const uuid = hexToUuid(hex32);
  if (!isUuidV4(uuid)) {
    throw new Error("decoded value is not a valid UUID v4");
  }
  return uuid;
}

/** Mid-level helper: encode arbitrary hex (with optional leading-zero strip) as Base59. */
export function encodeCustomHexBase59(hex: string, stripLeadingZeros = true): string {
  const normalized = hex.toLowerCase();
  if (!HEX_PATTERN.test(normalized)) {
    throw new Error("hex must contain only [0-9a-f] characters");
  }
  const source = stripLeadingZeros ? stripLeadingZeroHex(normalized) : normalized;
  return encodeHexBase59(source);
}

/** Mid-level helper: decode Base59 to hex with optional minimum width padding. */
export function decodeCustomHexBase59(
  encoded: string,
  minHexLength?: number,
): string {
  return decodeHexBase59(encoded, minHexLength);
}

/** Expose payload hex → BigInt for callers composing other codecs on the same floor. */
export function uuidPayloadHexToBigInt(uuid: string): bigint {
  const payload = stripUuidVersionNibble(uuidToHex(uuid));
  return hexToBigInt(stripLeadingZeroHex(payload));
}
