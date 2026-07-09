// Base59 codec: Bitcoin Base58 alphabet plus `_` (59 symbols). Isomorphic — uses BigInt only.

/** Base58 charset with `_` appended (59 symbols, no `0`, `O`, `I`, or `l`). */
export const BASE59_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz_" as const;

const BASE59_BASE = 59n;

const BASE59_CHAR_TO_VALUE = new Map<string, bigint>(
  [...BASE59_ALPHABET].map((char, index) => [char, BigInt(index)]),
);

const HEX_PATTERN = /^[0-9a-fA-F]*$/;

/** Strip leading `0` hex digits; a lone `0` is preserved. */
export function stripLeadingZeroHex(hex: string): string {
  const normalized = hex.toLowerCase();
  if (!HEX_PATTERN.test(normalized)) {
    throw new Error("hex must contain only [0-9a-f] characters");
  }
  const stripped = normalized.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/** Parse a hex string (no `0x` prefix) into a non-negative BigInt. */
export function hexToBigInt(hex: string): bigint {
  const normalized = hex.toLowerCase();
  if (!HEX_PATTERN.test(normalized)) {
    throw new Error("hex must contain only [0-9a-f] characters");
  }
  if (normalized.length === 0) {
    throw new Error("hex must not be empty");
  }
  return BigInt(`0x${normalized}`);
}

/** Render a non-negative BigInt as lowercase hex without a `0x` prefix. */
export function bigIntToHex(value: bigint): string {
  if (value < 0n) {
    throw new Error("value must be non-negative");
  }
  if (value === 0n) {
    return "0";
  }
  return value.toString(16);
}

/** Encode a non-negative BigInt as Base59 (leading-zero run uses the alphabet's zero digit). */
export function encodeBase59(value: bigint): string {
  if (value < 0n) {
    throw new Error("value must be non-negative");
  }
  if (value === 0n) {
    return BASE59_ALPHABET[0]!;
  }

  let remaining = value;
  let encoded = "";
  while (remaining > 0n) {
    const digit = remaining % BASE59_BASE;
    remaining /= BASE59_BASE;
    encoded = BASE59_ALPHABET[Number(digit)]! + encoded;
  }
  return encoded;
}

/** Decode a Base59 string into a non-negative BigInt. */
export function decodeBase59(encoded: string): bigint {
  if (encoded.length === 0) {
    throw new Error("Base59 string must not be empty");
  }

  let value = 0n;
  for (const char of encoded) {
    const digit = BASE59_CHAR_TO_VALUE.get(char);
    if (digit === undefined) {
      throw new Error(`invalid Base59 character: ${char}`);
    }
    value = value * BASE59_BASE + digit;
  }
  return value;
}

/** Encode hex as Base59 after stripping leading `0` digits (shortest representation). */
export function encodeHexBase59(hex: string): string {
  return encodeBase59(hexToBigInt(stripLeadingZeroHex(hex)));
}

/**
 * Decode Base59 to hex. When `minHexLength` is set, left-pad with `0` to that width
 * (useful when the original hex had stripped leading zeros).
 */
export function decodeHexBase59(encoded: string, minHexLength?: number): string {
  const hex = bigIntToHex(decodeBase59(encoded));
  if (minHexLength === undefined) {
    return hex;
  }
  if (hex.length > minHexLength) {
    throw new Error(
      `decoded hex length ${hex.length} exceeds minimum width ${minHexLength}`,
    );
  }
  return hex.padStart(minHexLength, "0");
}
