import { contentCommitment } from "./crypto/commitment.js";
import { hashLeaf } from "./crypto/merkle.js";
import type { LedgerConnector } from "./ledger/connector.js";
import type { PrivateStore } from "./private/store.js";

/** Per-transaction verdict produced while walking an entity's chain. */
export interface TxVerdict {
  txId: string;
  op: string;
  envelopeIntact: boolean; // stored envelope hashes to the recorded txHash
  chainLinked: boolean; // prevHash == previous tx's txHash
  ledgerAgrees: boolean; // immudb's stored envelope matches + verifyRow passes
  contentMatches: boolean | "erased"; // revealed content recomputes the commitment (or erased)
  ok: boolean;
}

export interface ChainReport {
  entityId: string;
  ok: boolean;
  verdicts: TxVerdict[];
}

/**
 * Verify an entity's append-only history end to end:
 *   1. each stored envelope hashes to its recorded `txHash` (no envelope tampering),
 *   2. the per-entity `prevHash` chain is unbroken,
 *   3. immudb's committed envelope matches the private store's, and `immudb_verify_row` passes,
 *   4. where content is still revealed, it recomputes the committed `contentHash`
 *      (an erased entry is accepted on hash alone — the chain still verifies).
 *
 * Tampering with the mutable store (e.g. editing raw content without a new transaction)
 * surfaces as a failed `contentMatches`; tampering the envelope fails `envelopeIntact`.
 */
export async function verifyEntityChain(
  store: PrivateStore,
  connector: LedgerConnector,
  entityId: string,
): Promise<ChainReport> {
  const history = await store.getEntityHistory(entityId);
  const verdicts: TxVerdict[] = [];
  let expectedPrev: string | null = null;

  for (const tx of history) {
    const envelopeIntact = hashLeaf(tx.envelope) === tx.txHash;
    const chainLinked = tx.prevHash === expectedPrev;

    const ledgerEnvelope = await connector.getEnvelope(tx.txId);
    const rowCheck = await connector.verifyRow(tx.txId);
    const ledgerAgrees = ledgerEnvelope === tx.envelope && rowCheck.verified;

    let contentMatches: boolean | "erased";
    if (tx.salt == null || tx.content == null) {
      contentMatches = "erased";
    } else {
      contentMatches =
        contentCommitment({ id: tx.txId, salt: tx.salt, content: tx.content }) === tx.contentHash;
    }

    const ok =
      envelopeIntact && chainLinked && ledgerAgrees && contentMatches !== false;
    verdicts.push({ txId: tx.txId, op: tx.op, envelopeIntact, chainLinked, ledgerAgrees, contentMatches, ok });
    expectedPrev = tx.txHash;
  }

  return { entityId, ok: history.length > 0 && verdicts.every((v) => v.ok), verdicts };
}
