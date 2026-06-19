// Client-side per-thread binding inputs (types/payload only). Promoted from `passkey-test`.
//
// At thread registration the client produces these inputs; the PLATFORM signs the binding (see
// ./platform-binding.ts). The `binding` half is what the platform commits to and what the settlement
// attestation references opaquely; the `opening` half (user_id, salt_t) stays private until a
// selective reveal (R11). NEITHER the commitment NOR the opening ever rides on the public TxEnvelope
// — the envelope carries `thread_pubkey` only.

import { newSalt, threadCommitment } from "../crypto/commitment.js";

/** The public side of the registration binding — the fields the platform signs over (§6). */
export interface ThreadBindingPublic {
  thread_pubkey: string;
  thread_id: string;
  level: string;
  kyc_tier?: string;
  region?: string;
  /** Opaque H(user_id, salt_t, thread_id, level). */
  commitment: string;
}

/** The private opening — held privately until the user authorizes a per-thread reveal. */
export interface ThreadBindingOpening {
  user_id: string;
  /** 32-byte salt, hex. */
  salt_t: string;
}

export interface ThreadBindingInputs {
  binding: ThreadBindingPublic;
  opening: ThreadBindingOpening;
}

export interface BuildBindingInput {
  userId: string;
  threadPubkey: string;
  threadId: string;
  level: string;
  kycTier?: string;
  region?: string;
  /** Optional fixed salt for deterministic vectors; otherwise a fresh 32-byte salt is generated. */
  saltT?: string;
}

export function buildThreadBindingInputs(input: BuildBindingInput): ThreadBindingInputs {
  const salt_t = input.saltT ?? newSalt();
  const commitment = threadCommitment({
    userId: input.userId,
    saltT: salt_t,
    threadId: input.threadId,
    level: input.level,
  });
  const binding: ThreadBindingPublic = {
    thread_pubkey: input.threadPubkey,
    thread_id: input.threadId,
    level: input.level,
    ...(input.kycTier !== undefined ? { kyc_tier: input.kycTier } : {}),
    ...(input.region !== undefined ? { region: input.region } : {}),
    commitment,
  };
  return { binding, opening: { user_id: input.userId, salt_t } };
}
