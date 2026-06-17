import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { randomBytes } from "node:crypto";

/** Domain-separation tag — prevents cross-protocol hash reuse/collisions. */
export const CONTENT_DOMAIN = "oursay/v1/content";

/**
 * Deterministic, canonical JSON: object keys sorted recursively, no incidental
 * whitespace. This is LOAD-BEARING — every hash and Merkle proof depends on
 * byte-exact re-serialization, so producers and verifiers must agree exactly.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
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
 * The content commitment written to the public ledger:
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
