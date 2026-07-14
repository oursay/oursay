/**
 * Pool-gate errors for {@link PublicChain.append}: a `txId` already on immudb must never re-enter
 * the Postgres pool (Postgres is not a durable mirror of the append-only ledger).
 */

/** `getEnvelope(txId)` returned a row — refuse to pool a (possibly different) payload under that id. */
export class TxIdAlreadyOnChainError extends Error {
  readonly code = "tx_id_already_on_chain" as const;
  readonly txId: string;

  constructor(txId: string) {
    super("txId already exists on the public record");
    this.name = "TxIdAlreadyOnChainError";
    this.txId = txId;
  }
}

/** Ledger connect / `getEnvelope` failed — fail closed (do not pool blindly). */
export class LedgerUnavailableError extends Error {
  readonly code = "ledger_unavailable" as const;

  constructor(cause?: unknown) {
    const detail =
      cause instanceof Error ? cause.message : cause != null ? String(cause) : "unreachable";
    super(
      detail.startsWith("public-record ledger unavailable")
        ? detail
        : `public-record ledger unavailable: ${detail}`,
    );
    this.name = "LedgerUnavailableError";
  }
}
