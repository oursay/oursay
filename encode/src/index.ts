// @oursay/encode — shared encoding primitives with ZERO runtime dependencies.
//
// Primary use today: compact UUID v4 → Base59 post IDs in URLs (`encodeUuidV4Base59` /
// `decodeUuidV4Base59`). Lower-level `base59` helpers are exported for other hex payloads.
//
// Monorepo layout note: shared isomorphic floors like this one, `@oursay/slugs`, `@oursay/geo`,
// and `@oursay/identity` currently live as sibling workspace roots. As more cross-cutting
// primitives accumulate, consider grouping them under a top-level `lib/` directory (e.g.
// `lib/encode`, `lib/slugs`, `lib/geo`, `lib/identity`) so backend (`@oursay/api`) and
// frontend (`@oursay/web-app`) import from one obvious shared tree. Migration would be
// renames + `workspaces` / `transpilePackages` updates — no API change required.

export {
  BASE59_ALPHABET,
  bigIntToHex,
  decodeBase59,
  decodeHexBase59,
  encodeBase59,
  encodeHexBase59,
  hexToBigInt,
  stripLeadingZeroHex,
} from "./base59.js";

export {
  UUID_V4_PATTERN,
  UUID_V4_PAYLOAD_HEX_LENGTH,
  UUID_V4_VERSION_NIBBLE_INDEX,
  decodeCustomHexBase59,
  decodeUuidV4Base59,
  encodeCustomHexBase59,
  encodeUuidV4Base59,
  hexToUuid,
  insertUuidVersionNibble,
  isUuidV4,
  normalizeUuid,
  stripUuidVersionNibble,
  uuidPayloadHexToBigInt,
  uuidToHex,
} from "./uuid-base59.js";

export { encodeEntityIdForDisplay } from "./entity-id.js";

export {
  formatThreadPasskeyDisplayName,
  formatThreadPasskeyUserName,
} from "./passkey-labels.js";
