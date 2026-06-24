// IdentitySession — client-side signing orchestration (connector-agnostic).
//
// Built from an UnlockedSession (one account passkey unlock). Under Option A (docs/08 §5.4) each
// thread has its OWN WebAuthn passkey credential: the credential's public key is the envelope AUTHOR,
// and every civic append is a fresh user-verifying assertion bound to the envelope's signing digest.
// The account unlock survives only to seed the per-(user, jurisdiction) singleton `nullifierRoot`
// (separate from envelope signing). All crypto is delegated to @oursay/public-record — this module
// never re-implements commitment/envelope logic.

// Import public-record crypto via its pure-crypto SUBPATHS (not the barrel) so the client bundles for
// the browser without dragging in the server stack (pg/immudb/config). Crypto is never re-implemented.
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
   * The thread's public AUTHOR key — the per-thread WebAuthn passkey pubkey. Creates the credential
   * on first use (at join / first append) and returns its pubkey thereafter. This replaces the old
   * derived persona: under Option A the credential IS the thread identity.
   */
  async authorPubkey(t: ThreadRef): Promise<string> {
    const existing = this.s.threadCredentialPubkey(t.threadId);
    if (existing) return existing;
    const { authorPubkey } = await this.s.createThreadCredential({ threadId: t.threadId, jurisdiction: t.jurisdiction });
    return authorPubkey;
  }

  /** Client-side binding inputs to join a thread. The opening (user_id, salt_t) stays client-side. */
  async bindingInputs(t: ThreadRef, o: { kycTier?: string } = {}): Promise<ThreadBindingInputs> {
    return buildThreadBindingInputs({
      userId: this.s.userId,
      threadPubkey: await this.authorPubkey(t),
      threadId: t.threadId,
      jurisdiction: t.jurisdiction,
      kycTier: o.kycTier,
    });
  }

  /** The per-(user, jurisdiction) nullifier for a singleton action on `parentId` (shared across the user's devices). */
  nullifier(t: ThreadRef, parentId: string): string {
    return threadNullifier(deriveNullifierSecret(this.s.nullifierRoot(t.jurisdiction), t.jurisdiction), parentId);
  }

  /**
   * Assemble + WebAuthn-sign an envelope from a server `prepare()` result and an intent. The envelope
   * carries `author = the thread passkey pubkey` and `signScheme = "webauthn-es256"`; the assertion's
   * challenge is bound to the envelope's signing digest, so each append is a fresh, user-verified
   * signature. Singleton creates mint the per-(user, jurisdiction) nullifier; singleton updates/deletes
   * carry the prepared one forward.
   */
  async buildSigned(t: ThreadRef, prep: PreparedAppend, intent: Intent): Promise<SignedSubmission> {
    const authorPubkey = await this.authorPubkey(t);
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
