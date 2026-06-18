import type { AnchorRecord, BlockBundle } from "./types.js";

/**
 * A target's PUBLISH CADENCE. Settlement (pool → chain) and publication (chain → target) are
 * decoupled: blocks settle on the block trigger, then each target flushes settled-but-unpublished
 * blocks on its own schedule. `shouldPublish` only gates WHEN to flush; the publisher always emits
 * every eligible block in height order (no gaps), so an append-only target stays contiguous.
 */
export interface AnchorPublishPolicy {
  shouldPublish(latestSettledHeight: number, lastPublishedHeight: number): boolean;
}

/** Publish once at least `n` settled-but-unpublished blocks have accumulated (n clamped to ≥ 1). */
export function everyNBlocks(n: number): AnchorPublishPolicy {
  const step = Math.max(1, n);
  return { shouldPublish: (latest, last) => latest - last >= step };
}

/**
 * Where a block's anchor + bundle are PUBLISHED — the seam that makes the record verifiable
 * without the platform. Append-only and pluggable: the file target below is the only required
 * implementation and the primitive under a future Git transparency-log / chain connector.
 *
 * All `fetch*` reads model an auditor obtaining artifacts independently of the platform API.
 * Implementations MUST fail loudly on an inconsistent target rather than silently re-anchor.
 */
export interface AnchorTarget {
  /** This target's publish cadence (consulted by AnchorPublisher.maybePublish). */
  readonly publishPolicy: AnchorPublishPolicy;

  /** Publish a block. APPEND-ONLY: must never rewrite or overwrite a previously published block. */
  publish(bundle: BlockBundle): Promise<void>;

  /** The latest published anchor (the checkpoint the next block continues from); undefined if none. */
  fetchLatestAnchor(): Promise<AnchorRecord | undefined>;

  /** The anchor for a given block height — the auditor's independent source of `bundleMerkleRoot`. */
  fetchAnchor(blockHeight: number): Promise<AnchorRecord | undefined>;

  /** The full published bundle for a given block height. */
  fetchBundle(blockHeight: number): Promise<BlockBundle | undefined>;

  /** All published anchors, ascending by height. */
  listAnchors(): Promise<AnchorRecord[]>;
}
