import { canonicalJson, sha256Hex } from "../crypto/commitment.js";
import { hashLeaf, merkleProof, merkleRoot } from "../crypto/merkle.js";
import type { LedgerConnector } from "../ledger/connector.js";
import type { PrivateStore, StoredTx } from "../private/store.js";
import type { AnchorTarget } from "./target.js";
import type { AnchorRecord, BlockBundle, BlockEntry } from "./types.js";

export interface CloseBlockOptions {
  /** Upper bound (inclusive) for this block; defaults to the current max seq. */
  toSeq?: number;
  /** Injected capture timestamp (tests). Reuse the same value when asserting the next chain link. */
  capturedAt?: string;
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
 * Derives an INCREMENTAL block from the global seq stream at close time and publishes it.
 * A block covers `(fromSeq, toSeq]` — the slice since the last published anchor — not a
 * cumulative re-bundle of all history. Produces two roots: an app-level `bundleMerkleRoot` over
 * the block's envelopes (offline verification) and the `immudbRoot` at close (ledger witness).
 */
export class BlockBuilder {
  constructor(
    private readonly store: PrivateStore,
    private readonly connector: LedgerConnector,
  ) {}

  /** Close and publish the next block. Returns the bundle, or null if there is nothing to close. */
  async closeBlock(target: AnchorTarget, opts: CloseBlockOptions = {}): Promise<BlockBundle | null> {
    const prev = await target.fetchLatestAnchor();
    const fromSeq = prev?.toSeq ?? 0;
    const blockHeight = (prev?.blockHeight ?? 0) + 1;
    const toSeq = opts.toSeq ?? (await this.store.getMaxSeq());
    if (toSeq <= fromSeq) return null;

    const txs = await this.store.getTxsBySeqRange(fromSeq, toSeq);
    if (txs.length === 0) return null;

    // Leaves over the EXACT stored canonical envelope strings, in seq order (deterministic).
    const leaves = txs.map((t) => hashLeaf(t.envelope));
    const bundleMerkleRoot = merkleRoot(leaves);
    const immu = await this.connector.state();

    const anchor: AnchorRecord = {
      v: 1,
      blockHeight,
      fromSeq,
      toSeq,
      txCount: txs.length,
      bundleMerkleRoot,
      immudbRoot: { db: immu.db, txId: immu.txId, txHashHex: immu.txHashHex },
      prevBlockRoot: prev?.bundleMerkleRoot ?? null,
      // Plain SHA-256 over the canonical prev record AS WRITTEN (incl. its capturedAt) — not hashLeaf.
      prevAnchorHash: prev ? sha256Hex(canonicalJson(prev)) : null,
      capturedAt: opts.capturedAt ?? new Date().toISOString(),
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

    const bundle: BlockBundle = { anchor, entries };
    await target.publish(bundle);
    return bundle;
  }
}
