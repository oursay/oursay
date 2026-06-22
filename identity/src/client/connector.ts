// PasskeyConnector — the swappable account-auth + key-custody seam (Identity & Device Policy §6).
//
// One interface, two backends:
//   - WebPasskeyConnector — real browser WebAuthn (PRF → jurisdiction master; secure-storage fallback).
//   - DevPasskeyConnector  — simulated, headless, deterministic; for dev + CI ONLY (env-guarded).
//
// The connector handles PASSKEY ACCOUNT AUTH and custody of on-device key MATERIAL. It does NOT
// know about threads, envelopes, or public-record — that orchestration lives in IdentitySession.
// A passkey authenticates the session and unlocks derivation material; it NEVER signs civic actions
// (passkey-test/FINDINGS §1). Private material lives on the device and (for Dev) under `.oursay-dev/`;
// it is never sent to the platform.
//
// Key custody model (Method 3, §5.4):
//   - deviceRoot  — per-(device) 32-byte secret → thread-scoped DEVICE signer keys (per (device,thread)).
//   - jurisdictionMaster — per-(user, jurisdiction) secret, shared across the user's devices
//                   (passkey sync / encrypted backup), → the thread PERSONA (author id) per (user,thread).
//   - nullifierRoot — per-(user, jurisdiction) secret, shared across devices → singleton nullifiers.

/** The PUBLIC handle for an enrolled device (account-level key goes into `device_keys`). */
export interface DeviceCredential {
  userId: string;
  deviceId: string;
  /** Account-level compressed SEC1 P-256 pubkey (hex). Private; NEVER appears on an envelope. */
  devicePubkey: string;
}

/**
 * An unlocked, in-memory session for one device. Produced once per `unlock()` (which is the only
 * step that prompts the passkey); subsequent derive/sign operations reuse this material and never
 * re-prompt. The roots are raw bytes here because all derivation is CLIENT-SIDE — the trust boundary
 * is "the server/platform never holds private keys", which this honours.
 */
export interface UnlockedSession {
  readonly userId: string;
  readonly deviceId: string;
  readonly devicePubkey: string;
  /** 32-byte per-device root for thread-scoped signer derivation (deriveDeviceThreadSigner). */
  readonly deviceRoot: Uint8Array;
  /** Per-(user, jurisdiction) master, shared across the user's devices → thread personas. */
  jurisdictionMaster(jurisdiction: string): Uint8Array;
  /** Per-(user, jurisdiction) nullifier root, shared across the user's devices → singleton dedupe. */
  nullifierRoot(jurisdiction: string): Uint8Array;
}

export interface PasskeyConnector {
  /** Which backend this is — useful for guards/logging. */
  readonly mode: "web" | "dev";
  /**
   * Enrol a NEW device credential for a user (account auth / passkey registration). Returns the
   * PUBLIC handle the caller hands to the server (`device_keys`). Private material stays on device.
   * `deviceId` may be supplied for reproducible dev/test enrollment; otherwise one is generated.
   */
  enrollDevice(o: { userId: string; label?: string; deviceId?: string }): Promise<DeviceCredential>;
  /**
   * Authenticate an existing device credential (passkey assertion) and return an unlocked session.
   * One unlock per session; derivation/signing afterwards never re-prompts.
   */
  unlock(o: { userId: string; deviceId: string }): Promise<UnlockedSession>;
}
