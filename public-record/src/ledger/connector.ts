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

/** A pluggable transport to the append-only immudb chain. */
export interface LedgerConnector {
  connect(): Promise<void>;
  close(): Promise<void>;

  /** Append one transaction's commitment row. Append-only. */
  appendTx(row: ChainRow): Promise<void>;

  /** Liveness probe — true if the chain is reachable. Used by the outbox relay's retry policy. */
  healthcheck(): Promise<boolean>;

  /** Read back the canonical envelope for a transaction id (undefined if absent). */
  getEnvelope(txId: string): Promise<string | undefined>;

  /** immudb's current cryptographic root — the value we would anchor externally. */
  state(): Promise<LedgerRoot>;

  /** Per-row verification. `provenance` tells the caller how much it proves. */
  verifyRow(txId: string): Promise<RowVerification>;

  readonly transport: "pgwire" | "grpc";
}
