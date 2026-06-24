// IdentityRegistry — the in-process SERVER helpers @oursay/api exposes as HTTP.
//
// Holds the platform's record engine (PrivateStore + RecordService) and binding key. It accepts
// only PUBLIC material from the client (pubkeys, the opaque commitment, signed envelopes) and
// performs the verified-tier writes. The production civic write path is webauthn-es256 (Option A):
// each thread has its own passkey, whose pubkey IS the author; the RecordService verifies the
// per-append assertion (and the jurisdiction policy hard-requires it for vote/petition_signature).
//
// Wiring (Option A §5.4): join thread → `thread_keys` + `thread_bindings` + `thread_civic_credentials`
// (the per-thread revoke handle); submit → `appendSigned` (author = the thread passkey pubkey, no signer).
//
// A join binds account↔thread-key OWNERSHIP. `kyc_tier` is OPTIONAL on the binding (verification tier
// is applied at read/count time, not fixed at join); when omitted it must stay omitted on both the
// signed payload and the re-verification reconstruction (`bindingFromRow`) so canonical JSON matches.

import { RecordService, signBinding } from "@oursay/public-record";
import type { PrivateStore } from "@oursay/public-record";
import type { Ref } from "@oursay/public-record";
import type { ThreadBindingPublic } from "@oursay/public-record";
import type {
  DeviceEnrollment,
  Intent,
  PreparedAppend,
  SignedSubmission,
  ThreadRegistration,
} from "../shared/types.js";

export interface IdentityRegistryOptions {
  store: PrivateStore;
  /** A RecordService built with `requireDeviceSigner: true` (verified/production path). */
  svc: RecordService;
  /** The platform binding private key (hex) — signs each thread registration binding. */
  platformBindingPrivKeyHex: string;
}

export class IdentityRegistry {
  constructor(private readonly o: IdentityRegistryOptions) {}

  /** Ensure the verified human's account row exists. */
  async ensureUser(u: { userId: string; handle?: string }): Promise<void> {
    await this.o.store.putUser({ id: u.userId, handle: u.handle });
  }

  /** Enroll a device's account-level public key → `device_keys`. Idempotent. */
  async enrollDevice(e: DeviceEnrollment): Promise<void> {
    await this.o.store.enrollDeviceKey({ userId: e.userId, devicePubkey: e.devicePubkey, label: e.label ?? null });
  }

  /**
   * Join a thread (Option A): platform-sign the binding and write `thread_keys` + `thread_bindings`
   * (registerThreadBinding) and the per-thread civic credential row (registerThreadCredential). The
   * thread passkey pubkey IS the author identity — there is no separate device/signer. The binding is
   * built to match `bindingFromRow` exactly (kyc_tier included ONLY when bound) so `verifyThreadBinding`
   * re-verifies it at append time. The credential row (credential_pubkey = personaPubkey) is the
   * "revoke this thread's passkey" handle appendSigned enforces.
   */
  async joinThread(r: ThreadRegistration): Promise<void> {
    const binding: ThreadBindingPublic = {
      thread_pubkey: r.personaPubkey,
      thread_id: r.threadId,
      jurisdiction: r.jurisdiction,
      // Include kyc_tier only when provided — see bindingFromRow / canonicalJson note.
      ...(r.kycTier !== undefined ? { kyc_tier: r.kycTier } : {}),
      commitment: r.commitment,
    };
    const bindingSig = signBinding(binding, this.o.platformBindingPrivKeyHex);

    await this.o.store.registerThreadBinding({
      threadPubkey: r.personaPubkey,
      userId: r.userId,
      threadId: r.threadId,
      jurisdiction: r.jurisdiction,
      kycTier: r.kycTier ?? null,
      commitment: r.commitment,
      bindingSig,
    });
    await this.o.store.registerThreadCredential({
      credentialPubkey: r.personaPubkey,
      userId: r.userId,
      threadId: r.threadId,
      jurisdiction: r.jurisdiction,
    });
  }

  /** Server-derived fields the client must sign over (`author` = the thread persona pubkey). */
  async prepare(intent: Intent, author: string): Promise<PreparedAppend> {
    if (intent.op === "create") {
      return this.o.svc.prepareAppend({
        op: "create",
        type: intent.type,
        author,
        parent: intent.parent,
        entityId: intent.entityId,
        content: intent.content,
      });
    }
    return this.o.svc.prepareAppend({ op: intent.op, author, entityId: intent.entityId });
  }

  /** Accept a client-signed, device-signed envelope into the verified record. */
  async submit(s: SignedSubmission): Promise<Ref> {
    return this.o.svc.appendSigned(s);
  }
}
