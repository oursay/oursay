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
// AUTH-time result, not the create-time `enabled` flag (FINDINGS §2).
//
// PRF-unavailable fallback (built): when the authenticator produces no PRF output, the IKM comes from
// the secure-storage master (`./secure-store.ts`) — a random 32-byte master sealed under a
// non-extractable AES-GCM key in IndexedDB — instead of throwing. The HKDF expansion below is IDENTICAL
// either way; only the SOURCE of the IKM differs (FINDINGS §3). A credential must therefore enroll and
// unlock via the SAME source: the devicePubkey/persona are functions of the IKM, so if PRF availability
// changes for a device it must RE-ENROLL (we do not auto-detect a source switch). Custody trade-off:
// PRF keeps the root inside the authenticator; the fallback materializes it in memory and shifts custody
// to the device-bound non-extractable wrapping key. Derived signing keys are always ephemeral in memory.
//
// This module imports ONLY @noble + the DOM WebAuthn/Web Crypto/IndexedDB APIs + ./secure-store (no
// public-record), so it bundles for the browser cleanly. In Node the constructor throws (no `navigator`).

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/abstract/utils";
import type { DeviceCredential, PasskeyConnector, UnlockedSession } from "./connector.js";
import { IndexedDbKeyStore, WebCryptoMasterStore, type SecureMasterStore } from "./secure-store.js";

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
  /** Override the PRF-unavailable fallback store. Default: IndexedDB-backed non-extractable AES master. */
  secureStore?: SecureMasterStore;
}

export class WebPasskeyConnector implements PasskeyConnector {
  readonly mode = "web" as const;
  /** Diagnostic: which IKM source the most recent enroll/unlock used (for QA — e.g. the walk page). */
  lastUnlockSource: "prf" | "secure-store" | null = null;
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly secureStore: SecureMasterStore;

  constructor(opts: WebPasskeyOptions = {}) {
    if (typeof navigator === "undefined" || !navigator.credentials) {
      throw new Error("WebPasskeyConnector requires a browser with WebAuthn (navigator.credentials)");
    }
    this.rpId = opts.rpId ?? (typeof location !== "undefined" ? location.hostname : "localhost");
    this.rpName = opts.rpName ?? "OurSay";
    this.secureStore = opts.secureStore ?? new WebCryptoMasterStore(new IndexedDbKeyStore());
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
    // derive the account-level device pubkey from the unlock root (PRF, else secure-storage fallback)
    const root = await this.unlockRoot(credentialId, o.userId);
    const devicePubkey = bytesToHex(p256.getPublicKey(p256PrivFrom(root32(root, "oursay/web/device-root", deviceId), `account|${o.userId}`)));
    this.storeDevicePubkey(o.userId, deviceId, devicePubkey);
    return { userId: o.userId, deviceId, devicePubkey };
  }

  async unlock(o: { userId: string; deviceId: string }): Promise<UnlockedSession> {
    const credentialId = this.loadCredentialId(o.userId, o.deviceId);
    const devicePubkey = this.loadDevicePubkey(o.userId, o.deviceId);
    const root = await this.unlockRoot(credentialId, o.userId);
    const deviceRoot = root32(root, "oursay/web/device-root", o.deviceId);
    return {
      userId: o.userId,
      deviceId: o.deviceId,
      devicePubkey,
      deviceRoot,
      jurisdictionMaster: (jurisdiction: string) => root32(root, "oursay/web/jurisdiction-master", jurisdiction),
      nullifierRoot: (jurisdiction: string) => root32(root, "oursay/web/nullifier-root", jurisdiction),
    };
  }

  // ── Unlock root: PRF, else secure-storage fallback ───────────────────────────────────────────

  /**
   * The 32-byte derivation IKM for this credential. PRF when the authenticator produces it (kept inside
   * the authenticator), else the secure-storage fallback master (FINDINGS §3). Both expand identically
   * via {@link root32}. Source-consistency invariant: a credential must enroll AND unlock via the same
   * source — the devicePubkey/persona are functions of this root — so if PRF availability changes for a
   * device it must RE-ENROLL. The fallback master is keyed per (user, this device).
   */
  private async unlockRoot(credentialId: Uint8Array, userId: string): Promise<Uint8Array> {
    const prf = await this.assertAndProbePrf(credentialId);
    if (prf) {
      this.lastUnlockSource = "prf";
      return prf;
    }
    this.lastUnlockSource = "secure-store";
    return this.secureStore.getOrCreate(`oursay/web/master/${userId}`);
  }

  /**
   * One passkey assertion (this gates unlock/auth regardless of PRF). The assertion MUST succeed — a
   * null result is a cancelled/failed ceremony and throws (we never fall back past a real auth failure).
   * Returns the 32-byte PRF root when the authenticator produced one — gate on the AUTH-time result, not
   * the create-time `enabled` flag (FINDINGS §2) — else `null` so {@link unlockRoot} can fall back to
   * secure storage (PRF genuinely absent, but the user DID authenticate).
   */
  private async assertAndProbePrf(credentialId: Uint8Array): Promise<Uint8Array | null> {
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
    if (!assertion) throw new Error("passkey assertion cancelled");
    const results = assertion.getClientExtensionResults().prf?.results?.first;
    return results ? new Uint8Array(results as ArrayBuffer) : null;
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
