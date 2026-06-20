// Thin WebAuthn helpers: the relying-party settings (from config) and byte conversions for storing
// COSE public keys in BYTEA. The actual ceremonies live in PasskeyService over @simplewebauthn/server.

import { webauthnConfig } from "../config.js";

export interface RelyingParty {
  rpID: string;
  rpName: string;
  origin: string;
}

export function relyingParty(): RelyingParty {
  return { rpID: webauthnConfig.rpID, rpName: webauthnConfig.rpName, origin: webauthnConfig.origin };
}

/** Node Buffer (e.g. a BYTEA column) → a plain Uint8Array as @simplewebauthn expects. Allocating a
 *  fresh `new Uint8Array(length)` guarantees an ArrayBuffer (not SharedArrayBuffer) backing, which
 *  the library's Uint8Array<ArrayBuffer> parameter type requires. */
export function toUint8(buf: Buffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

/** @simplewebauthn's Uint8Array public key → Node Buffer for a BYTEA insert. */
export function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}
