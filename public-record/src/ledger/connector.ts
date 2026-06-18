// The pluggable seam between the record service and the append-only chain (immudb).
// Everything above this interface is transport-agnostic; today only a pg-wire connector
// exists, but a gRPC connector can be added without disturbing callers (see PROPOSAL §4).

/** immudb's current cryptographic root — the value that would be anchored externally. */
export interface LedgerRoot {
  db: string;
  txId: number;
  txHashHex: string;
  serverUuid?: string; // gRPC trusted-state slot; absent for pg-wire
}

/** Per-row verification result. `provenance` says HOW MUCH it proves (see PROPOSAL §4.4). */
export interface RowVerification {
  verified: boolean;
  txId: number;
  revision: number;
  provenance: "server" | "client";
}

/** One row of the append-only chain — a single transaction's public commitment. */
export interface ChainRow {
  txId: string;
  type: string;
  entityId: string;
  op: string;
  parentType?: string;
  parentId?: string;
  parentRevisionHash?: string;
  authorPubkey: string;
  signature: string;
  createdAt: string;
  prevHash: string | null;
  contentHash: string;
  txHash: string;
  envelope: string; // canonical JSON of the TxEnvelope — the verified value
}

/**
 * Who attests a block — reserved for doc 07 §4's consensus-ready header. Stage 1 settles with no
 * proposer and an empty attestation set (signing is stubbed); reserving the shape now means a
 * custodian quorum later is not a breaking change to the header / anchor format.
 */
export interface BlockAttestation {
  pubkey: string;
  signature: string;
}

/**
 * A settled block's header on the append-only chain — the unit of agreement (doc 07 invariant 4).
 * `chainId` is the genesis/network id (see BLOCKS_DDL); `(chainId, blockHeight)` identifies a block.
 * Carries both the seq range it settles and the two chaining values: `prevBlockRoot` (the prior
 * block's Merkle root) and `chainTipHash` (the cumulative tip linking this block to all prior ones).
 * `proposer` + `attestations` separate WHO attests from WHAT is committed (reserved; empty today).
 */
export interface BlockHeader {
  chainId: string;
  blockHeight: number; // 1-based within a chainId; block 1 is genesis
  fromSeq: number; // exclusive lower bound (prev block's toSeq; 0 at genesis)
  toSeq: number; // inclusive upper bound
  txCount: number;
  bundleMerkleRoot: string; // app-level Merkle root over this block's envelopes (the "block hash")
  chainTipHash: string; // cumulative tip: sha256(prevChainTipHash, bundleMerkleRoot)
  prevBlockRoot: string | null; // block N-1's bundleMerkleRoot (null at genesis)
  prevChainTipHash: string | null; // block N-1's chainTipHash (null at genesis)
  immudbRoot: { db: string; txId: number; txHashHex: string }; // captured AFTER the batch tx append
  proposer: string | null; // the attesting actor (reserved; null in stage 1)
  attestations: BlockAttestation[]; // signature set over the block (reserved; empty in stage 1)
  capturedAt: string; // ISO; operational cadence metadata, never an ordering authority
}

/** A pluggable transport to the append-only immudb chain. */
export interface LedgerConnector {
  connect(): Promise<void>;
  close(): Promise<void>;

  /** Append one transaction's commitment row, tagged to `chainId`. Append-only. */
  appendTx(chainId: string, row: ChainRow): Promise<void>;

  /**
   * Append a batch of commitment rows at settlement, all tagged to `chainId`. Idempotent: a row
   * already present (by tx_id) is skipped, so a re-run after a crash mid-batch never double-writes
   * / violates the PRIMARY KEY.
   */
  appendTxBatch(chainId: string, rows: ChainRow[]): Promise<void>;

  /**
   * Append a settled block's header. Idempotent on `(chainId, blockHeight)`: re-settling the same
   * height is a no-op, so a crash between the tx batch and the header (or a re-run) is safe.
   */
  appendBlock(header: BlockHeader): Promise<void>;

  /** The latest settled block for a chain — the tip the next settlement continues from. */
  fetchLatestBlock(chainId: string): Promise<BlockHeader | undefined>;

  /** A settled block header by height (the publisher's source when assembling a bundle). */
  fetchBlockByHeight(chainId: string, blockHeight: number): Promise<BlockHeader | undefined>;

  /** Liveness probe — true if the chain is reachable. Used by the settlement retry policy. */
  healthcheck(): Promise<boolean>;

  /** Read back the canonical envelope for a transaction id (undefined if absent). */
  getEnvelope(txId: string): Promise<string | undefined>;

  /** immudb's current cryptographic root — the value we would anchor externally. */
  state(): Promise<LedgerRoot>;

  /** Per-row verification. `provenance` tells the caller how much it proves. */
  verifyRow(txId: string): Promise<RowVerification>;

  readonly transport: "pgwire" | "grpc";
}
