// Q4 — the opaque per-thread commitment H(user_id, salt_t, thread_id, level).
//
// PROPOSAL §6 names the fields but does not pin the byte encoding. This spike pins it to mirror
// public-record's `contentCommitment` pattern: sha256 over domain-tagged canonical JSON, with
// `salt_t` carried as a HEX STRING (matching newSalt()'s output) so the encoding is unambiguous.
// Composed from public-record's primitives — NOT a re-implementation. FINDINGS recommends porting
// a matching `threadCommitment()` into public-record/src/crypto/commitment.ts in the library pass.

import { canonicalJson, sha256Hex } from "@oursay/public-record/crypto/commitment";

/** Domain-separation tag — keeps this commitment distinct from content commitments. */
export const THREAD_COMMITMENT_DOMAIN = "oursay/v1/thread-commitment";

export interface ThreadCommitmentInput {
  userId: string;
  /** 32-byte salt as a HEX STRING (client-generated, e.g. from newSalt()). */
  saltT: string;
  threadId: string;
  level: string;
}

/** Opaque, hiding commitment. Reveals nothing about user_id/salt_t without the opening. */
export function threadCommitment(input: ThreadCommitmentInput): string {
  return sha256Hex(
    canonicalJson({
      ds: THREAD_COMMITMENT_DOMAIN,
      user_id: input.userId,
      salt_t: input.saltT,
      thread_id: input.threadId,
      level: input.level,
    }),
  );
}
