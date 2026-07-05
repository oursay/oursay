import { sha256 } from "@noble/hashes/sha256";
// randomBytes from @noble (not node:crypto) so this pure-crypto module stays isomorphic and
// browser-bundleable — @noble uses the platform CSPRNG (crypto.getRandomValues in the browser).
import { bytesToHex, randomBytes } from "@noble/hashes/utils";

/** Domain-separation tag — prevents cross-protocol hash reuse/collisions. */
export const CONTENT_DOMAIN = "oursay/v1/content";

/**
 * Deterministic, canonical JSON: object keys sorted recursively, no incidental
 * whitespace. This is LOAD-BEARING — every hash and chain link depends on byte-exact
 * re-serialization, so producers and verifiers must agree exactly.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/**
 * Deterministic JSON with sorted keys AND indentation — for human-readable, git-friendly,
 * reproducible artifacts on disk (e.g. block bundle files). Same key order as canonicalJson;
 * NOT used for hashing (hashes always use the compact `canonicalJson`).
 */
export function canonicalStringify(value: unknown, space = 2): string {
  return JSON.stringify(sortDeep(value), null, space);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return bytesToHex(sha256(bytes));
}

/** A fresh 32-byte salt (hex). The blinding factor that makes a commitment hiding. */
export function newSalt(): string {
  return bytesToHex(randomBytes(32));
}

/**
 * The content commitment written to the public chain:
 *   sha256( canonicalJson({ ds, id, salt, content }) )
 *
 * Salt is mandatory: low-entropy content (a vote is ~2-8 possible values) would
 * otherwise be recoverable by brute-forcing the hash. The salt is secret (stored
 * only privately), so the published hash reveals nothing about the content.
 */
export function contentCommitment(input: { id: string; salt: string; content: unknown }): string {
  return sha256Hex(
    canonicalJson({ ds: CONTENT_DOMAIN, id: input.id, salt: input.salt, content: input.content }),
  );
}

/** Domain-separation tag for the opaque per-thread identity commitment (distinct from content). */
export const THREAD_COMMITMENT_DOMAIN = "oursay/v1/thread-commitment";

export interface ThreadCommitmentInput {
  userId: string;
  /** 32-byte salt as a HEX STRING (client-generated; e.g. from {@link newSalt}). */
  saltT: string;
  threadId: string;
  /** The JURISDICTION id this thread is scoped to (e.g. `ab-ca-gov`); the identity partition. */
  jurisdiction: string;
}

/**
 * The opaque per-thread commitment bound into a private platform registration binding (§6):
 *   sha256( canonicalJson({ ds, user_id, salt_t, thread_id, jurisdiction }) )
 *
 * `salt_t` is carried as a hex string so the encoding is unambiguous. The commitment is hiding:
 * it reveals nothing about `user_id`/`salt_t` without the opening, and it NEVER appears on the
 * public envelope (which carries `thread_pubkey` only). Promoted from the `passkey-test` spike.
 */
export function threadCommitment(input: ThreadCommitmentInput): string {
  return sha256Hex(
    canonicalJson({
      ds: THREAD_COMMITMENT_DOMAIN,
      user_id: input.userId,
      salt_t: input.saltT,
      thread_id: input.threadId,
      jurisdiction: input.jurisdiction,
    }),
  );
}
