// A minimal software WebAuthn authenticator for tests: it produces registration (attestation,
// fmt="none") and authentication (assertion) responses that the REAL @simplewebauthn/server verifies.
// This is the deterministic stand-in for a browser-recorded fixture — no live browser needed in CI.
//
// It hand-builds the standard wire format: authenticatorData, a COSE P-256 public key, an
// attestationObject (CBOR), and an ECDSA-P256 (ES256) assertion signature over
// SHA-256(authData || SHA-256(clientDataJSON)). Crypto is @noble (already used across the monorepo).

import { randomBytes } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

const b64url = (b: Uint8Array): string => Buffer.from(b).toString("base64url");
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ── tiny CBOR encoder (only what attestationObject + COSE key need) ──────────
function cborHead(major: number, value: number): Uint8Array {
  const mt = major << 5;
  if (value < 24) return Uint8Array.of(mt | value);
  if (value < 0x100) return Uint8Array.of(mt | 24, value);
  if (value < 0x10000) return Uint8Array.of(mt | 25, (value >> 8) & 0xff, value & 0xff);
  return Uint8Array.of(mt | 26, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}
const cborUint = (n: number): Uint8Array => cborHead(0, n);
const cborNegInt = (n: number): Uint8Array => cborHead(1, -1 - n); // n < 0
const cborBytes = (b: Uint8Array): Uint8Array => concat(cborHead(2, b.length), b);
const cborText = (s: string): Uint8Array => concat(cborHead(3, utf8(s).length), utf8(s));
const cborMap = (entries: [Uint8Array, Uint8Array][]): Uint8Array =>
  concat(cborHead(5, entries.length), ...entries.flatMap(([k, v]) => [k, v]));

function coseKey(pubUncompressed: Uint8Array): Uint8Array {
  const x = pubUncompressed.slice(1, 33);
  const y = pubUncompressed.slice(33, 65);
  return cborMap([
    [cborUint(1), cborUint(2)], //   kty: EC2
    [cborUint(3), cborNegInt(-7)], // alg: ES256
    [cborNegInt(-1), cborUint(1)], // crv: P-256
    [cborNegInt(-2), cborBytes(x)],
    [cborNegInt(-3), cborBytes(y)],
  ]);
}

const AAGUID = new Uint8Array(16); // all-zero (no attestation)

export class SoftAuthenticator {
  private readonly priv: Uint8Array;
  private readonly pub: Uint8Array; // uncompressed (0x04 || x || y)
  readonly credId: Uint8Array;
  private signCount = 0;

  constructor(
    private readonly rpID: string,
    private readonly origin: string,
  ) {
    this.priv = p256.utils.randomPrivateKey();
    this.pub = p256.getPublicKey(this.priv, false);
    this.credId = new Uint8Array(randomBytes(20));
  }

  private rpIdHash(): Uint8Array {
    return sha256(utf8(this.rpID));
  }

  private clientData(type: "webauthn.create" | "webauthn.get", challenge: string): Uint8Array {
    return utf8(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  /** Produce a registration (attestation) response for a stored challenge. */
  register(challenge: string): RegistrationResponseJSON {
    const flags = 0x45; // UP | UV | AT
    const signCount = new Uint8Array(4); // 0
    const attestedCredData = concat(
      AAGUID,
      Uint8Array.of((this.credId.length >> 8) & 0xff, this.credId.length & 0xff),
      this.credId,
      coseKey(this.pub),
    );
    const authData = concat(this.rpIdHash(), Uint8Array.of(flags), signCount, attestedCredData);
    const attestationObject = cborMap([
      [cborText("fmt"), cborText("none")],
      [cborText("attStmt"), cborMap([])],
      [cborText("authData"), cborBytes(authData)],
    ]);
    const clientDataJSON = this.clientData("webauthn.create", challenge);

    return {
      id: b64url(this.credId),
      rawId: b64url(this.credId),
      response: {
        clientDataJSON: b64url(clientDataJSON),
        attestationObject: b64url(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
      type: "public-key",
      authenticatorAttachment: "platform",
    };
  }

  /** Produce an authentication (assertion) response for a stored challenge. */
  authenticate(challenge: string, userHandle?: string): AuthenticationResponseJSON {
    this.signCount += 1;
    const flags = 0x05; // UP | UV
    const sc = this.signCount;
    const signCount = Uint8Array.of((sc >>> 24) & 0xff, (sc >>> 16) & 0xff, (sc >>> 8) & 0xff, sc & 0xff);
    const authData = concat(this.rpIdHash(), Uint8Array.of(flags), signCount);
    const clientDataJSON = this.clientData("webauthn.get", challenge);
    const digest = sha256(concat(authData, sha256(clientDataJSON)));
    const signature = p256.sign(digest, this.priv, { lowS: true }).toDERRawBytes();

    return {
      id: b64url(this.credId),
      rawId: b64url(this.credId),
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        ...(userHandle ? { userHandle: b64url(utf8(userHandle)) } : {}),
      },
      clientExtensionResults: {},
      type: "public-key",
      authenticatorAttachment: "platform",
    };
  }
}
