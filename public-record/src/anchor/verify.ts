import { canonicalJson, contentCommitment, sha256Hex } from "../crypto/commitment.js";
import { hashLeaf, verifyMerkleProof } from "../crypto/merkle.js";
import type { AnchorRecord, BlockBundle, BlockEntry } from "./types.js";

/**
 * The OFFLINE auditor. Pure functions — no Postgres, no immudb, no platform API. The trust pivot
 * is `bundleMerkleRoot === anchoredRoot`, where `anchoredRoot` is obtained INDEPENDENTLY from the
 * anchor target (e.g. the published `anchors.jsonl`), not from the platform.
 *
 * Revealed entries verify that their `(salt, content)` recomputes the committed `contentHash`;
 * redacted/erased entries verify on hash-only inclusion (their plaintext was never published).
 */

export type EntryVerdict =
  | { txId: string; seq: number; status: "revealed"; ok: true }
  | { txId: string; seq: number; status: "withheld"; ok: true } // hash-only inclusion
  | { txId: string; seq: number; status: "failed"; ok: false; reason: string };

export interface BlockReport {
  blockHeight: number;
  ok: boolean;
  rootMatches: boolean;
  txCountOk: boolean;
  verdicts: EntryVerdict[];
}

/**
 * Verify ONE entry against its block's anchor + an independently-obtained root. Enough to audit a
 * single transaction without loading any other entry or prior block.
 */
export function verifyEntry(entry: BlockEntry, anchor: AnchorRecord, anchoredRoot: string): EntryVerdict {
  const base = { txId: entry.txId, seq: entry.seq };

  // 1. The entry must belong to this block's seq range.
  if (!(anchor.fromSeq < entry.seq && entry.seq <= anchor.toSeq)) {
    return { ...base, status: "failed", ok: false, reason: `seq ${entry.seq} outside block range (${anchor.fromSeq}, ${anchor.toSeq}]` };
  }

  // 2. The leaf must be the hash of the exact envelope as shipped.
  if (hashLeaf(entry.envelope) !== entry.leafHash) {
    return { ...base, status: "failed", ok: false, reason: "envelope/leaf mismatch (tampered envelope)" };
  }

  // 3. The inclusion proof must chain the leaf to the anchored root.
  if (!verifyMerkleProof(entry.leafHash, entry.merkleProof, anchoredRoot)) {
    return { ...base, status: "failed", ok: false, reason: "merkle proof does not reach the anchored root" };
  }

  // 4. If plaintext is revealed, it must recompute the envelope's commitment.
  if (entry.reveal) {
    let env: { txId: string; contentHash: string };
    try {
      env = JSON.parse(entry.envelope) as { txId: string; contentHash: string };
    } catch {
      return { ...base, status: "failed", ok: false, reason: "envelope is not valid JSON" };
    }
    const recomputed = contentCommitment({ id: env.txId, salt: entry.reveal.salt, content: entry.reveal.content });
    if (recomputed !== env.contentHash) {
      return { ...base, status: "failed", ok: false, reason: "revealed content does not match commitment" };
    }
    return { ...base, status: "revealed", ok: true };
  }

  // Redacted/erased: present and provably included, but plaintext withheld.
  return { ...base, status: "withheld", ok: true };
}

/**
 * Verify a whole block against an independently-obtained root: the bundle's claimed root must
 * equal `anchoredRoot`, the entry count must match, every entry's seq must fall in range, and
 * every entry must verify.
 */
export function verifyBlock(bundle: BlockBundle, anchoredRoot: string): BlockReport {
  const rootMatches = bundle.anchor.bundleMerkleRoot === anchoredRoot;
  const txCountOk = bundle.anchor.txCount === bundle.entries.length;
  const verdicts = bundle.entries.map((e) => verifyEntry(e, bundle.anchor, anchoredRoot));
  const ok = rootMatches && txCountOk && verdicts.every((v) => v.ok);
  return { blockHeight: bundle.anchor.blockHeight, ok, rootMatches, txCountOk, verdicts };
}

/**
 * The cumulative chain-tip fold: each block hashes the previous tip together with its own block
 * hash (`bundleMerkleRoot`), so one value commits to the entire block history. Genesis folds a
 * `null` previous tip. Producer (settlement) and verifier MUST agree byte-for-byte, so it is defined
 * once here and reused by the settler.
 */
export function computeChainTipHash(prevChainTipHash: string | null, bundleMerkleRoot: string): string {
  return sha256Hex(canonicalJson({ prevChainTipHash, bundleMerkleRoot }));
}

/**
 * Verify that block `curr` correctly chains onto a TRUSTED prior anchor `prev` — contiguous seq
 * ranges, height + 1, matching prev root, the cumulative chain-tip fold, and the tamper-evident
 * `prevAnchorHash`. An auditor who already trusts `prev`'s root can validate `curr`'s chain metadata
 * WITHOUT re-merkling `prev`.
 *
 * Note (v1): this checks the chain LINK only. `txCount` and `immudbRoot` progression are not part
 * of the link — `immudbRoot` is an external witness, not required monotonic here, and `txCount` is
 * validated against the actual entries by `verifyBlock`. Tightening either is a future option.
 */
export function verifyChainLink(curr: AnchorRecord, prev: AnchorRecord): boolean {
  return (
    curr.blockHeight === prev.blockHeight + 1 &&
    curr.fromSeq === prev.toSeq &&
    curr.prevBlockRoot === prev.bundleMerkleRoot &&
    curr.prevChainTipHash === prev.chainTipHash &&
    curr.chainTipHash === computeChainTipHash(curr.prevChainTipHash, curr.bundleMerkleRoot) &&
    curr.prevAnchorHash === sha256Hex(canonicalJson(prev))
  );
}

/**
 * Walk a full chain of anchors (ascending by height) and confirm it is intact end to end: every
 * anchor belongs to ONE chain (and matches `expectedChainId` if given — so an auditor checking a
 * known genesis can't be fed another chain's anchors), genesis has no predecessors, every block
 * links to the one before it (verifyChainLink), and each block's own chain-tip fold is self-
 * consistent. Returns the verified tip, or null if any check fails — the cheap "is the whole chain
 * intact, which chain, and what is the tip?" check.
 */
export function verifyChain(
  anchors: AnchorRecord[],
  expectedChainId?: string,
): { ok: boolean; tipHash: string | null } {
  if (anchors.length === 0) return { ok: true, tipHash: null };
  const chainId = anchors[0].chainId;
  if (expectedChainId !== undefined && chainId !== expectedChainId) return { ok: false, tipHash: null };
  if (anchors.some((a) => a.chainId !== chainId)) return { ok: false, tipHash: null }; // no mixing chains
  const genesis = anchors[0];
  const genesisOk =
    genesis.blockHeight === 1 &&
    genesis.fromSeq === 0 &&
    genesis.prevBlockRoot === null &&
    genesis.prevChainTipHash === null &&
    genesis.prevAnchorHash === null &&
    genesis.chainTipHash === computeChainTipHash(null, genesis.bundleMerkleRoot);
  if (!genesisOk) return { ok: false, tipHash: null };
  for (let i = 1; i < anchors.length; i++) {
    if (!verifyChainLink(anchors[i], anchors[i - 1])) return { ok: false, tipHash: null };
  }
  return { ok: true, tipHash: anchors[anchors.length - 1].chainTipHash };
}
