import type { MerkleStep } from "../crypto/merkle.js";
import type { Op, RecordType } from "../schema/types.js";

/** immudb's cryptographic root at block close — the ledger integrity witness. */
export interface ImmudbRootRef {
  db: string;
  txId: number;
  txHashHex: string;
}

/**
 * The small, publishable witness for one block — one canonical-JSON line in `anchors.jsonl`.
 * Blocks are INCREMENTAL: each covers the seq range `(fromSeq, toSeq]` of the global stream,
 * not a cumulative re-bundle of all history.
 */
export interface AnchorRecord {
  v: 1;
  blockHeight: number; // 1-based; block 1 is genesis
  fromSeq: number; // exclusive lower bound (previous block's toSeq; 0 at genesis)
  toSeq: number; // inclusive upper bound
  txCount: number;
  bundleMerkleRoot: string; // app-level Merkle root over this block's envelopes (offline verify)
  immudbRoot: ImmudbRootRef; // ledger integrity witness captured at close
  prevBlockRoot: string | null; // block N-1's bundleMerkleRoot (chaining; null at genesis)
  /**
   * Plain `sha256Hex(canonicalJson(prev AnchorRecord AS WRITTEN, including its capturedAt))`.
   * NOT a Merkle leaf hash (those are `hashLeaf` of envelopes). null at genesis.
   */
  prevAnchorHash: string | null;
  /**
   * ISO timestamp. Excluded from root/leaf reproducibility, BUT included in the next block's
   * `prevAnchorHash`, so a test that injects `capturedAt` must reuse the same value when
   * asserting the next block's chain link.
   */
  capturedAt: string;
}

/** One published transaction in a block bundle. */
export interface BlockEntry {
  txId: string;
  seq: number;
  entityId: string;
  type: RecordType;
  op: Op;
  envelope: string; // the EXACT canonical envelope string (byte-exact; feeds leafHash)
  leafHash: string; // hashLeaf(envelope)
  merkleProof: MerkleStep[]; // leaf -> bundleMerkleRoot
  /**
   * Present ONLY for non-redacted, non-erased txs. A redacted tx omits `reveal` even though the
   * private store still retains its raw content — the bundle is a PUBLIC publish artifact.
   */
  reveal?: { salt: string; content: unknown };
}

/** A full, publishable block: the anchor witness + the envelopes/proofs/reveals it covers. */
export interface BlockBundle {
  anchor: AnchorRecord;
  entries: BlockEntry[];
}
