import { canonicalJson, contentCommitment } from "./commitment.js";
import { hashLeaf, verifyMerkleProof } from "./merkle.js";
import type { PublicBundle } from "./types.js";

export type EntryVerdict =
  | { id: string; status: "revealed"; ok: true }
  | { id: string; status: "redacted"; ok: true } // hash-only, valid inclusion
  | { id: string; status: "failed"; ok: false; reason: string };

export interface VerifyReport {
  ok: boolean;
  rootMatches: boolean;
  verdicts: EntryVerdict[];
}

/**
 * Independent, OFFLINE auditor. It is handed:
 *   - a published `bundle`, and
 *   - `anchoredMerkleRoot` obtained INDEPENDENTLY from external infra (GitHub tag /
 *     on-chain event) — NOT from the bundle itself.
 *
 * It never contacts the OurSay server. A malicious operator cannot produce a bundle
 * that both verifies internally AND matches the externally-anchored root without also
 * compromising the external anchor. Redacted entries verify by hash alone (no plaintext).
 */
export function verifyBundle(bundle: PublicBundle, anchoredMerkleRoot: string): VerifyReport {
  // Trust pivot: the bundle's claimed root must equal the externally-anchored root.
  const rootMatches = bundle.anchor.bundleMerkleRoot === anchoredMerkleRoot;

  const verdicts: EntryVerdict[] = [];
  for (const e of bundle.entries) {
    const id = e.envelope.id;

    // 1. Leaf must be the hash of the canonical envelope as shipped.
    const recomputedLeaf = hashLeaf(canonicalJson(e.envelope));
    if (recomputedLeaf !== e.leafHash) {
      verdicts.push({ id, status: "failed", ok: false, reason: "envelope/leaf mismatch (tampered envelope)" });
      continue;
    }

    // 2. Inclusion proof must chain the leaf to the anchored root.
    if (!verifyMerkleProof(e.leafHash, e.merkleProof, anchoredMerkleRoot)) {
      verdicts.push({ id, status: "failed", ok: false, reason: "merkle proof does not reach anchored root" });
      continue;
    }

    // 3. If plaintext is revealed, it must hash to the envelope's commitment.
    if (e.reveal) {
      const recomputed = contentCommitment({ id, salt: e.reveal.salt, content: e.reveal.content });
      if (recomputed !== e.envelope.contentHash) {
        verdicts.push({ id, status: "failed", ok: false, reason: "revealed content does not match commitment" });
        continue;
      }
      verdicts.push({ id, status: "revealed", ok: true });
    } else {
      // Redacted/erased: present and provably included, but plaintext withheld.
      verdicts.push({ id, status: "redacted", ok: true });
    }
  }

  const ok = rootMatches && verdicts.every((v) => v.ok);
  return { ok, rootMatches, verdicts };
}
