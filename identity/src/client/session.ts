// IdentitySession — client-side signing orchestration (connector-agnostic).
//
// Built from an UnlockedSession (one passkey unlock). Derives the thread PERSONA (author id, from
// the per-(user, jurisdiction) master — stable across the user's devices) and the thread-scoped
// DEVICE signer (from this device's root), then assembles + device-signs envelopes. All crypto is
// delegated to @oursay/public-record — this module never re-implements commitment/envelope logic.
//
// Derivation never prompts; only the connector's `unlock()` does. So a session signs many messages
// without re-authenticating (Identity & Device Policy §6 UX intent).

import { randomUUID } from "node:crypto";
import {
  buildThreadBindingInputs,
  contentCommitment,
  deriveDeviceThreadSigner,
  deriveNullifierSecret,
  deriveThreadKey,
  newSalt,
  signEnvelopeWithDevice,
  threadNullifier,
} from "@oursay/public-record";
import { DELETE_MARKER } from "@oursay/public-record/schema/types";
import type { TxEnvelope } from "@oursay/public-record/schema/types";
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
  /** Account-level device pubkey — for enrollment (`device_keys`); never goes on an envelope. */
  get devicePubkey(): string {
    return this.s.devicePubkey;
  }

  /** The stable thread persona (public author id) for this thread — same on any of the user's devices. */
  personaPubkey(t: ThreadRef): string {
    return deriveThreadKey({ jurisdictionMaster: this.s.jurisdictionMaster(t.jurisdiction), threadId: t.threadId, jurisdiction: t.jurisdiction }).threadPubkey;
  }

  /** This device's thread-scoped signer pubkey (distinct per (device, thread); no cross-thread linker). */
  signerPubkey(t: ThreadRef): string {
    return this.signerKey(t).signerPubkey;
  }

  /** Client-side binding inputs to join a thread. The opening (user_id, salt_t) stays client-side. */
  bindingInputs(t: ThreadRef, o: { kycTier?: string } = {}) {
    return buildThreadBindingInputs({
      userId: this.s.userId,
      threadPubkey: this.personaPubkey(t),
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
   * Assemble + DEVICE-sign an envelope from a server `prepare()` result and an intent. The envelope
   * carries `author = persona`, `signer = this device's thread-scoped key`. Singleton creates mint
   * the per-(user, jurisdiction) nullifier; singleton updates/deletes carry the prepared one forward.
   */
  buildSigned(t: ThreadRef, prep: PreparedAppend, intent: Intent): SignedSubmission {
    const persona = this.personaPubkey(t);
    const signer = this.signerKey(t);
    const txId = randomUUID();
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
      authorPubkey: "",
      signature: "",
      createdAt: new Date().toISOString(),
      prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content }),
      ...(nullifier ? { nullifier } : {}),
    };
    const { envelope } = signEnvelopeWithDevice(base, signer.privKey, persona);
    return { envelope, salt, content };
  }

  private signerKey(t: ThreadRef) {
    return deriveDeviceThreadSigner({ deviceRoot: this.s.deviceRoot, threadId: t.threadId, jurisdiction: t.jurisdiction });
  }

  private nullifierFor(t: ThreadRef, prep: PreparedAppend, intent: Intent): string | undefined {
    if (intent.op === "create") return prep.nullifierParentId ? this.nullifier(t, prep.nullifierParentId) : undefined;
    return prep.nullifier ?? undefined; // carry-forward on singleton update/delete
  }
}
