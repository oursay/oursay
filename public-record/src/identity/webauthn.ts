// WebAuthn (ES256) assertion verification + a test/dev assertion BUILDER for the per-thread civic
// signing path (Option A, docs/08 §5.4). ONE verifier and ONE builder — the engine, the simulated
// dev passkey, and the tests all go through these, so producer and verifier never drift (PHILOSOPHY:
// byte-for-byte agreement is the whole point of the monorepo).
//
// Wire (schema/types.ts): the envelope carries `webauthn: { authenticatorData, clientDataJSON,
// signature }` (all base64url, no padding). The top-level `signature` stays "" on this path. The
// assertion's CHALLENGE is bound to signingDigest(envelope) (the envelope with `signature` AND
// `webauthn` blanked), so the ES256 signature covers the whole envelope. An OFFLINE verifier reads
// the chain leaf → blanks `webauthn` → recomputes the digest → re-verifies the assertion, with no
// connection to the platform (VALUES Value 1).
//
// Browser-safe: only @noble + Web-standard base64 (btoa/atob)/JSON, so it bundles for the client.

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { signingDigest } from "./envelope.js";
import type { TxEnvelope, WebauthnAssertion } from "../schema/types.js";

// authenticatorData flag bits (WebAuthn §6.1): byte[32] holds the flags.
const FLAG_UP = 0x01; // user present
const FLAG_UV = 0x04; // user verified (REQUIRED on this path)

// ── base64url (no padding) ──────────────────────────────────────────────────────────────────────
export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function base64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify a WebAuthn (ES256) envelope: the assertion's signature must verify against `signerPubkey`
 * (the DEVICE's per-thread WebAuthn passkey pubkey under the mvp-a5b persona/signer split — the
 * envelope's `authorPubkey` carries the stable thread persona Pₜ and is NOT used for this crypto
 * check). The user MUST have been verified (UV), the clientDataJSON must be a `webauthn.get` whose
 * challenge equals base64url(signingDigest(env)), and the signature is over
 * `authenticatorData || sha256(clientDataJSON)` (ES256 ⇒ ECDSA-P256-with-SHA256, DER-encoded).
 *
 * Scope: this is the connector-agnostic OFFLINE check (crypto + challenge-binding + UV + type). It
 * deliberately does NOT enforce rpIdHash/origin — a pure offline verifier cannot know a deployment's
 * RP id or origin. The API layer MAY add that check later (an optional, deferred hook).
 *
 * Persona↔signer authorization (Pₜ matches signerPubkey's thread) is enforced by RecordService /
 * appendSigned via thread_civic_credentials lookup, NOT here. Returns false (does not throw) when
 * the envelope is missing `signerPubkey` so downstream branches can produce uniform errors.
 */
export function verifyWebauthnAssertion(env: TxEnvelope): boolean {
  const wa = env.webauthn;
  if (!wa) return false;
  if (!env.signerPubkey) return false;
  try {
    const authData = base64urlDecode(wa.authenticatorData);
    const clientDataBytes = base64urlDecode(wa.clientDataJSON);
    const sigDer = base64urlDecode(wa.signature);
    if (authData.length < 37) return false; // rpIdHash(32) + flags(1) + signCount(4)
    const flags = authData[32];
    if (!(flags & FLAG_UP)) return false;
    if (!(flags & FLAG_UV)) return false;
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as {
      type?: string;
      challenge?: string;
    };
    if (clientData.type !== "webauthn.get") return false;
    if (clientData.challenge !== base64urlEncode(signingDigest(env))) return false;
    const msgHash = sha256(concatBytes(authData, sha256(clientDataBytes)));
    // Parse the DER ECDSA sig to compact r||s. lowS:false — WebAuthn authenticators may emit a
    // high-S signature, which we must still accept.
    const sig = p256.Signature.fromDER(sigDer).toCompactRawBytes();
    return p256.verify(sig, msgHash, hexToBytes(env.signerPubkey), { lowS: false });
  } catch {
    return false;
  }
}

export interface BuildAssertionInput {
  /** P-256 private scalar (32 bytes) of the simulated credential. */
  credentialPriv: Uint8Array;
  rpId: string;
  origin: string;
  /** The 32-byte challenge = signingDigest(envelope). */
  challenge: Uint8Array;
  signCount?: number;
}

/**
 * Build a real `webauthn.get` assertion the way an authenticator would (UV set, DER ES256 over
 * `authenticatorData || sha256(clientDataJSON)`). Used by the simulated dev passkey and the tests so
 * CI exercises the exact {@link verifyWebauthnAssertion} path — never a shortcut.
 */
export function buildWebauthnAssertion(input: BuildAssertionInput): WebauthnAssertion {
  const clientDataBytes = utf8ToBytes(
    JSON.stringify({
      type: "webauthn.get",
      challenge: base64urlEncode(input.challenge),
      origin: input.origin,
      crossOrigin: false,
    }),
  );
  const rpIdHash = sha256(utf8ToBytes(input.rpId));
  const flags = new Uint8Array([FLAG_UP | FLAG_UV]);
  const signCount = new Uint8Array(4);
  new DataView(signCount.buffer).setUint32(0, input.signCount ?? 0, false);
  const authData = concatBytes(rpIdHash, flags, signCount);
  const msgHash = sha256(concatBytes(authData, sha256(clientDataBytes)));
  const sig = p256.sign(msgHash, input.credentialPriv); // deterministic (RFC-6979), low-S
  return {
    authenticatorData: base64urlEncode(authData),
    clientDataJSON: base64urlEncode(clientDataBytes),
    signature: base64urlEncode(sig.toDERRawBytes()),
  };
}

/** The compressed SEC1 P-256 public key (hex) for a simulated credential private scalar. */
export function credentialPubkeyHex(credentialPriv: Uint8Array): string {
  return bytesToHex(p256.getPublicKey(credentialPriv));
}
