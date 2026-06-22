// WebPasskeyConnector — the real browser WebAuthn backend (promoted from passkey-test/web/app.js).
//
// Account auth + key custody via a platform passkey:
//   - register  → navigator.credentials.create (ES256 / -7), PRF extension probed.
//   - unlock    → navigator.credentials.get with PRF eval; one 32-byte PRF root per credential.
// From that single PRF root we HKDF-expand the device root + per-(user, jurisdiction) jurisdiction-
// master / nullifier-root (domain-separated). The passkey NEVER signs civic actions — it unlocks
// derivation material (§6).
//
// Cross-device note (honest limit, FINDINGS §3): a SYNCED passkey (same credential on two devices,
// e.g. iCloud Keychain) yields the SAME PRF root → shared per-user secrets and persona. INDEPENDENT
// passkeys yield different roots; the second device references the existing persona and signs with
// its own device signer, and per-jurisdiction nullifier consistency needs recovery/sync of the root (the
// platform attestation remains the dedupe backstop). PRF availability is uneven — gate on the
// AUTH-time result, not the create-time `enabled` flag (FINDINGS §2). A secure-storage fallback
// (non-exportable WebCrypto key + IndexedDB / largeBlob) is the production path when PRF is absent;
// it is documented here and left to the production hardening milestone.
//
// This module imports ONLY @noble + the DOM WebAuthn API (no public-record), so the optional browser
// shell can load it via an import map without a bundler. In Node it throws (no `navigator`).

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/abstract/utils";
import type { DeviceCredential, PasskeyConnector, UnlockedSession } from "./connector.js";

/** The single PRF salt we evaluate; everything else is HKDF-expanded from its result. */
const PRF_SALT = utf8ToBytes("oursay/v1/prf-root");

function p256PrivFrom(ikm: Uint8Array, info: string): Uint8Array {
  const okm = hkdf(sha256, ikm, utf8ToBytes("oursay/dev/p256"), utf8ToBytes(info), 48);
  const n = p256.CURVE.n;
  return numberToBytesBE((bytesToNumberBE(okm) % (n - 1n)) + 1n, 32);
}
function root32(ikm: Uint8Array, salt: string, info: string): Uint8Array {
  return hkdf(sha256, ikm, utf8ToBytes(salt), utf8ToBytes(info), 32);
}

export interface WebPasskeyOptions {
  /** WebAuthn RP id. Default: the page's hostname (e.g. "localhost"). */
  rpId?: string;
  rpName?: string;
}

export class WebPasskeyConnector implements PasskeyConnector {
  readonly mode = "web" as const;
  private readonly rpId: string;
  private readonly rpName: string;

  constructor(opts: WebPasskeyOptions = {}) {
    if (typeof navigator === "undefined" || !navigator.credentials) {
      throw new Error("WebPasskeyConnector requires a browser with WebAuthn (navigator.credentials)");
    }
    this.rpId = opts.rpId ?? (typeof location !== "undefined" ? location.hostname : "localhost");
    this.rpName = opts.rpName ?? "OurSay";
  }

  async enrollDevice(o: { userId: string; label?: string; deviceId?: string }): Promise<DeviceCredential> {
    const deviceId = o.deviceId ?? crypto.randomUUID();
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { id: this.rpId, name: this.rpName },
        user: { id: utf8ToBytes(`${o.userId}:${deviceId}`) as BufferSource, name: o.userId, displayName: o.label ?? o.userId },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256 / P-256 (required)
          { type: "public-key", alg: -257 }, // RS256 (silences a Chrome lint only)
        ],
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        timeout: 60_000,
        extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error("passkey registration cancelled");
    if ((cred.response as AuthenticatorAttestationResponse).getPublicKeyAlgorithm?.() !== -7) {
      throw new Error("passkey did not use ES256/P-256 (alg -7); OurSay requires it");
    }
    const credentialId = new Uint8Array(cred.rawId);
    this.storeCredentialId(o.userId, deviceId, credentialId);
    // derive the account-level device pubkey from the PRF root (one auth prompt)
    const prf = await this.prfRoot(credentialId);
    const devicePubkey = bytesToHex(p256.getPublicKey(p256PrivFrom(root32(prf, "oursay/web/device-root", deviceId), `account|${o.userId}`)));
    this.storeDevicePubkey(o.userId, deviceId, devicePubkey);
    return { userId: o.userId, deviceId, devicePubkey };
  }

  async unlock(o: { userId: string; deviceId: string }): Promise<UnlockedSession> {
    const credentialId = this.loadCredentialId(o.userId, o.deviceId);
    const devicePubkey = this.loadDevicePubkey(o.userId, o.deviceId);
    const prf = await this.prfRoot(credentialId);
    const deviceRoot = root32(prf, "oursay/web/device-root", o.deviceId);
    return {
      userId: o.userId,
      deviceId: o.deviceId,
      devicePubkey,
      deviceRoot,
      jurisdictionMaster: (jurisdiction: string) => root32(prf, "oursay/web/jurisdiction-master", jurisdiction),
      nullifierRoot: (jurisdiction: string) => root32(prf, "oursay/web/nullifier-root", jurisdiction),
    };
  }

  // ── WebAuthn PRF ───────────────────────────────────────────────────────────────────────────

  /** One passkey assertion → the 32-byte PRF root. Gates on the AUTH-time result (FINDINGS §2). */
  private async prfRoot(credentialId: Uint8Array): Promise<Uint8Array> {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        rpId: this.rpId,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: credentialId as BufferSource }],
        userVerification: "preferred",
        timeout: 60_000,
        extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    const results = assertion?.getClientExtensionResults().prf?.results?.first;
    if (!results) {
      throw new Error("WebAuthn PRF unavailable on this device; secure-storage fallback not yet built (production milestone)");
    }
    return new Uint8Array(results as ArrayBuffer);
  }

  // ── credential persistence (localStorage; a browser-local handle, not a secret) ──────────────

  private key(userId: string, deviceId: string, kind: string): string {
    return `oursay/web-passkey/${userId}/${deviceId}/${kind}`;
  }
  private storeCredentialId(userId: string, deviceId: string, id: Uint8Array): void {
    localStorage.setItem(this.key(userId, deviceId, "cred"), bytesToHex(id));
  }
  private loadCredentialId(userId: string, deviceId: string): Uint8Array {
    const hex = localStorage.getItem(this.key(userId, deviceId, "cred"));
    if (!hex) throw new Error(`no enrolled passkey for ${userId}/${deviceId}`);
    return hexToBytes(hex);
  }
  private storeDevicePubkey(userId: string, deviceId: string, pub: string): void {
    localStorage.setItem(this.key(userId, deviceId, "pub"), pub);
  }
  private loadDevicePubkey(userId: string, deviceId: string): string {
    const pub = localStorage.getItem(this.key(userId, deviceId, "pub"));
    if (!pub) throw new Error(`no device pubkey for ${userId}/${deviceId}`);
    return pub;
  }
}
