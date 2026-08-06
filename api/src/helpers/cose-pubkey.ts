// Convert auth.passkey_credentials COSE public keys to compressed SEC1 hex for platform-ops
// WebAuthn attestation verification (same format as civic signerPubkey).

import { p256 } from "@noble/curves/nist";
import { bytesToHex } from "@noble/hashes/utils";
import { convertCOSEtoPKCS } from "@simplewebauthn/server/helpers";
import { toUint8 } from "./webauthn.js";

/** COSE EC2 P-256 BYTEA → compressed SEC1 pubkey hex. */
export function cosePublicKeyToSec1Hex(cose: Buffer | Uint8Array): string {
  const pkcs = convertCOSEtoPKCS(toUint8(cose));
  let hex = bytesToHex(pkcs);
  // convertCOSEtoPKCS may return uncompressed without the 0x04 prefix (x||y = 64 bytes).
  if (hex.length === 128) hex = `04${hex}`;
  const point = p256.Point.fromHex(hex);
  return bytesToHex(point.toBytes(true));
}
