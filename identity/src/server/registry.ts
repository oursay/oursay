// IdentityRegistry — the in-process SERVER helpers @oursay/api exposes as HTTP.
//
// Holds the platform's record engine (PrivateStore + RecordService) and binding key. It accepts
// only PUBLIC material from the client (pubkeys, the opaque commitment, signed envelopes) and
// performs the verified-tier writes. The production civic write path is webauthn-es256 (Option A +
// mvp-a5b persona/signer split): `authorPubkey` is the stable thread persona Pₜ (first-wins per
// (user, thread) at join); `signerPubkey` is this device's per-thread WebAuthn passkey pubkey
// (REQUIRED). The RecordService verifies the per-append assertion against `signerPubkey` and
// authorizes via `thread_civic_credentials` (the jurisdiction policy hard-requires webauthn-es256
// for vote/petition_signature).
//
// Wiring (mvp-a5b §5.4): join thread → two-phase — (1) `ensureThreadPersona` mints/resolves Pₜ in
// `thread_keys` + `thread_bindings`; (2) `registerDeviceCredential` writes this device's signer
// under Pₜ in `thread_civic_credentials` with a platform `credential_sig` attestation. Submit →
// `appendSigned` (author = Pₜ, signer = device passkey; credential_sig re-verified on every append).
//
// A join binds account↔thread-key OWNERSHIP. `kyc_tier` is OPTIONAL on the binding (verification tier
// is applied at read/count time, not fixed at join); when omitted it must stay omitted on both the
// signed payload and the re-verification reconstruction (`bindingFromRow`) so canonical JSON matches.

import { RecordService, signBinding, signCredentialAuth } from "@oursay/public-record";
import type { PrivateStore } from "@oursay/public-record";
import type { Ref } from "@oursay/public-record";
import type { ThreadBindingPublic } from "@oursay/public-record";
import type {
  DeviceEnrollment,
  Intent,
  JoinThreadResponse,
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
   * Join a thread (mvp-a5b persona/signer split, docs/08 §5.4 rule 6). Two-phase:
   *   1. ensureThreadPersona — first device wins: adopt its `signerPubkey` as Pₜ and mint the
   *      platform binding under it. Subsequent devices reuse the existing Pₜ; the incoming
   *      `commitment` MUST match the bound one (different opening ⇒ reject). The binding is built
   *      to match `bindingFromRow` exactly (kyc_tier included ONLY when bound) so
   *      `verifyThreadBinding` re-verifies it at append time.
   *   2. registerDeviceCredential — write THIS device's `thread_civic_credentials` row under Pₜ
   *      with the platform-signed `credential_sig` attestation re-verified on every appendSigned.
   * Returns the canonical Pₜ so the client can persist it before any `buildSigned`.
   */
  async joinThread(r: ThreadRegistration): Promise<JoinThreadResponse> {
    const personaPubkey = await this.o.store.ensureThreadPersona({
      userId: r.userId,
      threadId: r.threadId,
      jurisdiction: r.jurisdiction,
      proposedPubkey: r.signerPubkey,
      commitment: r.commitment,
      kycTier: r.kycTier ?? null,
      signBinding: (winnerPt) => {
        const binding: ThreadBindingPublic = {
          thread_pubkey: winnerPt,
          thread_id: r.threadId,
          jurisdiction: r.jurisdiction,
          // Include kyc_tier only when provided — see bindingFromRow / canonicalJson note.
          ...(r.kycTier !== undefined ? { kyc_tier: r.kycTier } : {}),
          commitment: r.commitment,
        };
        return signBinding(binding, this.o.platformBindingPrivKeyHex);
      },
    });

    const credentialSig = signCredentialAuth(
      {
        domain: "credential-auth-v1",
        personaPubkey,
        credentialPubkey: r.signerPubkey,
        threadId: r.threadId,
        jurisdiction: r.jurisdiction,
        commitment: r.commitment,
      },
      this.o.platformBindingPrivKeyHex,
    );

    await this.o.store.registerDeviceCredential({
      credentialPubkey: r.signerPubkey,
      personaPubkey,
      userId: r.userId,
      threadId: r.threadId,
      jurisdiction: r.jurisdiction,
      credentialSig,
    });

    return { personaPubkey };
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
