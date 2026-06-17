import type { AnchorRecord, BlockBundle } from "./types.js";

/**
 * Where a block's anchor + bundle are PUBLISHED — the seam that makes the record verifiable
 * without the platform. Append-only and pluggable: the file target below is the only required
 * implementation and the primitive under a future Git transparency-log / chain connector.
 *
 * All `fetch*` reads model an auditor obtaining artifacts independently of the platform API.
 * Implementations MUST fail loudly on an inconsistent target rather than silently re-anchor.
 */
export interface AnchorTarget {
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
