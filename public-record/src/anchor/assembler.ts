import { canonicalJson, sha256Hex } from "../crypto/commitment.js";
import { hashLeaf, merkleProof, merkleRoot } from "../crypto/merkle.js";
import type { BlockHeader } from "../ledger/connector.js";
import type { PrivateStore, StoredTx } from "../private/store.js";
import type { AnchorRecord, BlockBundle, BlockEntry } from "./types.js";

export interface AssembleOptions {
  /**
   * Reveal override (test-only). Default/`true`: include reveals wherever revealable. `false`:
   * hash-only for all entries. Production leaves this unset (revealable-only).
   */
  reveal?: boolean;
}

/** A tx is revealable in a PUBLIC bundle only if not redacted, not erased, and still has its raw. */
function isRevealable(tx: StoredTx): boolean {
  return tx.redactedAt == null && tx.erasedAt == null && tx.salt != null && tx.content != null;
}

/**
 * Builds the publishable {@link BlockBundle} for an ALREADY-SETTLED block. Settlement fixes the
 * block's identity on the chain (height, seq range, `bundleMerkleRoot`, chain-tip, `immudbRoot`);
 * this re-reads the block's transactions from Postgres to attach the exact envelopes, Merkle
 * inclusion proofs, and the CURRENT reveals. Because reveals reflect live redaction/erasure, a tx
 * redacted after settlement is withheld here while the root + proofs still verify (they are over
 * envelopes, never plaintext). Pure assembly — it never writes.
 */
export class BundleAssembler {
  constructor(private readonly store: PrivateStore) {}

  /**
   * `prevPublishedAnchor` is the anchor most recently published TO THIS TARGET (the publish-layer
   * chain) and feeds `prevAnchorHash`. The block-layer chaining values (`prevBlockRoot`,
   * `prevChainTipHash`, `chainTipHash`) are taken straight from the settled header.
   */
  async assemble(
    header: BlockHeader,
    prevPublishedAnchor: AnchorRecord | undefined,
    opts: AssembleOptions = {},
  ): Promise<BlockBundle> {
    const txs = await this.store.getTxsBySeqRange(header.fromSeq, header.toSeq);

    // Leaves over the EXACT stored canonical envelopes, in seq order (deterministic).
    const leaves = txs.map((t) => hashLeaf(t.envelope));
    const root = merkleRoot(leaves);

    // The live pool MUST reproduce what was settled — otherwise the block and the pool diverged.
    if (root !== header.bundleMerkleRoot) {
      throw new Error(
        `bundle assembly: block ${header.blockHeight} root ${root} != settled ${header.bundleMerkleRoot}`,
      );
    }
    if (txs.length !== header.txCount) {
      throw new Error(
        `bundle assembly: block ${header.blockHeight} has ${txs.length} txs != settled txCount ${header.txCount}`,
      );
    }

    const anchor: AnchorRecord = {
      v: 1,
      blockHeight: header.blockHeight,
      fromSeq: header.fromSeq,
      toSeq: header.toSeq,
      txCount: header.txCount,
      bundleMerkleRoot: header.bundleMerkleRoot,
      immudbRoot: header.immudbRoot,
      prevBlockRoot: header.prevBlockRoot,
      chainTipHash: header.chainTipHash,
      prevChainTipHash: header.prevChainTipHash,
      // Plain SHA-256 over the canonical prev anchor AS WRITTEN — not a hashLeaf.
      prevAnchorHash: prevPublishedAnchor ? sha256Hex(canonicalJson(prevPublishedAnchor)) : null,
      capturedAt: header.capturedAt,
    };

    const allowReveal = opts.reveal !== false;
    const entries: BlockEntry[] = txs.map((t, i) => {
      const reveal = allowReveal && isRevealable(t) ? { salt: t.salt!, content: t.content } : undefined;
      return {
        txId: t.txId,
        seq: t.seq,
        entityId: t.entityId,
        type: t.type,
        op: t.op,
        envelope: t.envelope,
        leafHash: leaves[i],
        merkleProof: merkleProof(leaves, i),
        ...(reveal ? { reveal } : {}),
      };
    });

    return { anchor, entries };
  }
}
