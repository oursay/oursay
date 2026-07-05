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
// Civic signing (Option A, docs/08 §5.4): each (device, thread) has its OWN WebAuthn passkey
// credential. The credential's PUBLIC key is the envelope author; every civic append is a fresh
// user-verifying assertion bound to the envelope's signing digest (createThreadCredential /
// assertThread below). The account unlock survives only to seed the singleton `nullifierRoot`
// (separate from envelope signing). The legacy p256 derivation roots (deviceRoot / jurisdictionMaster)
// remain on the session for the dual-verifier / legacy path but are unused by the WebAuthn path.

import type { WebauthnAssertion } from "@oursay/public-record/schema/types";

/** The PUBLIC handle for an enrolled device (account-level key goes into `device_keys`). */
export interface DeviceCredential {
  userId: string;
  deviceId: string;
  /** Account-level compressed SEC1 P-256 pubkey (hex). Private; NEVER appears on an envelope. */
  devicePubkey: string;
}

/**
 * An unlocked, in-memory session for one device. Produced by `unlock()`; subsequent derive/sign
 * operations reuse this material and never re-prompt ("unlock once, sign many"). The roots are raw
 * bytes here because all derivation is CLIENT-SIDE — the trust boundary is "the server/platform never
 * holds private keys", which this honours.
 *
 * Prompt accounting (WebPasskeyConnector): `unlock()` triggers ONE passkey assertion per session.
 * `enrollDevice()` ALSO prompts — a registration plus one assertion — because the PRF root needed to
 * derive `devicePubkey` is only obtainable at auth time, not registration time (FINDINGS §2). So a
 * brand-new device's first use is registration + 2 assertions (enroll then unlock); a returning user
 * is a single assertion. We accept the one-time double-prompt rather than have `enrollDevice` return
 * the session it already unlocked — that would only save one gesture in a once-per-device setup and
 * would erode `unlock`'s role as the explicit per-session user-verification gate.
 */
export interface UnlockedSession {
  readonly userId: string;
  readonly deviceId: string;
  readonly devicePubkey: string;
  /** 32-byte per-device root for thread-scoped signer derivation (legacy p256 path). */
  readonly deviceRoot: Uint8Array;
  /** Per-(user, jurisdiction) master, shared across the user's devices (legacy p256 persona path). */
  jurisdictionMaster(jurisdiction: string): Uint8Array;
  /** Per-(user, jurisdiction) nullifier root, shared across the user's devices → singleton dedupe. */
  nullifierRoot(jurisdiction: string): Uint8Array;

  // ── Per-(device, thread) WebAuthn civic credential (mvp-a5b persona/signer split) ───────────
  /**
   * Create (once) this device's WebAuthn passkey credential for this thread and return its PUBLIC
   * key — the envelope's `signerPubkey` for every civic action this device makes in the thread.
   * Web: a `navigator.credentials.create` ceremony (UV); Dev: a deterministic per-(user, device,
   * thread) P-256 keypair. Idempotent at the store level (a second call returns the existing
   * credential's pubkey). The connector knows only about THIS device's signer; the stable thread
   * persona Pₜ (envelope `authorPubkey`) is returned by the server `join` response and lives on
   * `IdentitySession` / the per-thread store — not here.
   */
  createThreadCredential(o: { threadId: string; jurisdiction: string }): Promise<{ signingPubkey: string }>;
  /**
   * Produce a user-verifying WebAuthn assertion for this device's thread credential over
   * `challenge` (= signingDigest(envelope)). Web: `navigator.credentials.get` with
   * `userVerification:"required"`; Dev: a simulated assertion via the shared builder. Called PER
   * civic append (UV per action).
   */
  assertThread(o: { threadId: string; challenge: Uint8Array }): Promise<WebauthnAssertion>;
  /** This device's thread passkey PUBLIC key if a credential already exists for this thread,
   *  else null (= envelope `signerPubkey`). */
  threadSigningPubkey(threadId: string): string | null;
  /** The stable thread persona pubkey Pₜ for this thread (= envelope `authorPubkey`) if the
   *  server's `join` response has been persisted by IdentitySession for this thread, else null. */
  threadPersonaPubkey(threadId: string): string | null;
  /** Persist Pₜ for this thread (called once by IdentitySession after the server `join` response). */
  setThreadPersona(threadId: string, personaPubkey: string): void;
}

export interface PasskeyConnector {
  /** Which backend this is — useful for guards/logging. */
  readonly mode: "web" | "dev";
  /**
   * Enrol a NEW device credential for a user (account auth / passkey registration). Returns the
   * PUBLIC handle the caller hands to the server (`device_keys`). Private material stays on device.
   * `deviceId` may be supplied for reproducible dev/test enrollment; otherwise one is generated.
   * Prompts the passkey: a registration plus one assertion (to obtain the PRF root for `devicePubkey`).
   */
  enrollDevice(o: { userId: string; label?: string; deviceId?: string }): Promise<DeviceCredential>;
  /**
   * Authenticate an existing device credential (passkey assertion) and return an unlocked session.
   * One unlock per session; derivation/signing afterwards never re-prompts.
   */
  unlock(o: { userId: string; deviceId: string }): Promise<UnlockedSession>;
}
