// IdentitySession — client-side signing orchestration (connector-agnostic).
//
// Built from an UnlockedSession (one account passkey unlock). Under the mvp-a5b persona/signer
// split (docs/08 §5.4 rule 6) each (device, thread) has its OWN WebAuthn passkey credential whose
// PUBLIC key is the envelope's `signerPubkey`; the stable thread persona Pₜ (envelope
// `authorPubkey`) is allocated server-side by the first device's `join` and returned to every
// device thereafter. Every civic append is a fresh user-verifying assertion bound to the
// envelope's signing digest. The account unlock survives only to seed the per-(user, jurisdiction)
// singleton `nullifierRoot` (separate from envelope signing). All crypto is delegated to
// @oursay/public-record — this module never re-implements commitment/envelope logic.

// Import public-record crypto via its pure-crypto SUBPATHS (not the barrel) so the client bundles for
// the browser without dragging in the server stack (pg/immudb/config). Crypto is never re-implemented.
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { buildThreadBindingInputs } from "@oursay/public-record/identity/binding";
import { contentCommitment, newSalt } from "@oursay/public-record/crypto/commitment";
import { signingDigest } from "@oursay/public-record/identity/envelope";
import { deriveNullifierSecret, threadNullifier } from "@oursay/public-record/identity/nullifier";
import { DELETE_MARKER } from "@oursay/public-record/schema/types";
import type { TxEnvelope } from "@oursay/public-record/schema/types";
import type { ThreadBindingInputs } from "@oursay/public-record/identity/binding";
import type { UnlockedSession } from "./connector.js";
import type { Intent, PreparedAppend, SignedSubmission, ThreadRef } from "../shared/types.js";

export class IdentitySession {
  constructor(private readonly s: UnlockedSession) {}

  get userId(): string {
    return this.s.userId;
  }
  get deviceId(): string {
    return this.s.deviceId;
  }
  /** Account-level device pubkey — for optional device registration; never goes on an envelope. */
  get devicePubkey(): string {
    return this.s.devicePubkey;
  }

  /**
   * This device's per-thread WebAuthn passkey pubkey — the envelope's `signerPubkey`. Creates the
   * credential on first use (at join / first append) and returns its pubkey thereafter. The
   * connector knows only about this device's signer; the stable thread persona Pₜ (envelope
   * `authorPubkey`) is allocated server-side by the first device's `join` — see {@link personaPubkey}.
   */
  async signingPubkey(t: ThreadRef): Promise<string> {
    const existing = this.s.threadSigningPubkey(t.threadId);
    if (existing) return existing;
    const { signingPubkey } = await this.s.createThreadCredential({ threadId: t.threadId, jurisdiction: t.jurisdiction });
    return signingPubkey;
  }

  /**
   * The stable thread persona Pₜ for this thread — the envelope's `authorPubkey`. Populated by
   * {@link rememberPersona} after the server's `join` response returns Pₜ; throws when the thread
   * has not been joined yet (no `buildSigned` can run before a persona is known).
   */
  personaPubkey(t: ThreadRef): string {
    const p = this.s.threadPersonaPubkey(t.threadId);
    if (!p) throw new Error(`IdentitySession: thread persona for ${t.threadId} unknown — call join first and rememberPersona(Pₜ)`);
    return p;
  }

  /**
   * Persist the thread persona Pₜ returned by the server's `join` response. Must be called once per
   * thread BEFORE any `prepare` or `buildSigned`. Idempotent within the same Pₜ (re-store).
   */
  rememberPersona(t: ThreadRef, personaPubkey: string): void {
    // Force the device credential to exist before persisting Pₜ — the per-thread store row is the
    // anchor we attach personaPubkey to. Connectors created the credential during signingPubkey().
    if (!this.s.threadSigningPubkey(t.threadId)) {
      throw new Error(`IdentitySession.rememberPersona: no local credential for ${t.threadId}; call signingPubkey first`);
    }
    this.s.setThreadPersona(t.threadId, personaPubkey);
  }

  /** Client-side binding inputs to join a thread. The opening (user_id, salt_t) stays client-side.
   *  Uses THIS device's signing pubkey as the binding's `threadPubkey` — that pubkey is offered to
   *  the server as the candidate Pₜ; the server is the authority on whether it becomes Pₜ (first
   *  join wins) or is enrolled as an additional signer under the existing Pₜ.
   *
   *  `salt_t` is derived deterministically per `(user, jurisdiction, thread)` from the user's
   *  jurisdiction master (HKDF), so every device of the same user computes the SAME commitment for
   *  the same thread. That is what makes the server's commitment-match guard on second-device join
   *  pass — without it, two devices would propose two different openings under the same persona. */
  async bindingInputs(t: ThreadRef, o: { kycTier?: string } = {}): Promise<ThreadBindingInputs> {
    return buildThreadBindingInputs({
      userId: this.s.userId,
      threadPubkey: await this.signingPubkey(t),
      threadId: t.threadId,
      jurisdiction: t.jurisdiction,
      kycTier: o.kycTier,
      saltT: this.deterministicSaltT(t),
    });
  }

  /** Per-(user, jurisdiction, thread) 32-byte salt — derived from the jurisdictionMaster so all of
   *  this user's devices that share that master (PRF-synced passkey or shared dev custody) compute
   *  the same `commitment` for the same thread. Hex, 64 chars. */
  private deterministicSaltT(t: ThreadRef): string {
    const ikm = this.s.jurisdictionMaster(t.jurisdiction);
    const info = utf8ToBytes(`oursay/thread-saltT|${t.threadId}`);
    return bytesToHex(hkdf(sha256, ikm, utf8ToBytes("oursay/v1/thread-saltT"), info, 32));
  }

  /** The per-(user, jurisdiction) nullifier for a singleton action on `parentId` (shared across the user's devices). */
  nullifier(t: ThreadRef, parentId: string): string {
    return threadNullifier(deriveNullifierSecret(this.s.nullifierRoot(t.jurisdiction), t.jurisdiction), parentId);
  }

  /**
   * Assemble + WebAuthn-sign an envelope from a server `prepare()` result and an intent. The
   * envelope carries `authorPubkey = Pₜ` (stable thread persona) and `signerPubkey = this device's
   * thread passkey pubkey` under `signScheme = "webauthn-es256"`; the assertion's challenge is
   * bound to the envelope's signing digest, so each append is a fresh, user-verified signature.
   * Singleton creates mint the per-(user, jurisdiction) nullifier; singleton updates/deletes carry
   * the prepared one forward. Requires {@link rememberPersona} to have stored Pₜ for this thread.
   */
  async buildSigned(t: ThreadRef, prep: PreparedAppend, intent: Intent): Promise<SignedSubmission> {
    const signerPubkey = await this.signingPubkey(t);
    const authorPubkey = this.personaPubkey(t);
    const txId = crypto.randomUUID();
    const salt = newSalt();
    const content = intent.op === "delete" ? DELETE_MARKER : intent.content;
    const nullifier = this.nullifierFor(t, prep, intent);
    const base: TxEnvelope = {
      v: 1,
      txId,
      type: intent.type,
      entityId: intent.entityId,
      op: intent.op,
      ...(intent.op === "create" && intent.parent ? { parentType: intent.parent.type, parentId: intent.parent.id } : {}),
      ...(intent.op !== "create" && prep.parentType ? { parentType: prep.parentType } : {}),
      ...(intent.op !== "create" && prep.parentId ? { parentId: prep.parentId } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey,
      signerPubkey,
      signScheme: "webauthn-es256",
      signature: "", // the ES256 signature lives inside `webauthn`
      createdAt: new Date().toISOString(),
      prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content }),
      ...(nullifier ? { nullifier } : {}),
    };
    const webauthn = await this.s.assertThread({ threadId: t.threadId, challenge: signingDigest(base) });
    return { envelope: { ...base, webauthn }, salt, content };
  }

  private nullifierFor(t: ThreadRef, prep: PreparedAppend, intent: Intent): string | undefined {
    if (intent.op === "create") return prep.nullifierParentId ? this.nullifier(t, prep.nullifierParentId) : undefined;
    return prep.nullifier ?? undefined; // carry-forward on singleton update/delete
  }
}
