import { canonicalJson } from "../crypto/commitment.js";
import { hashLeaf } from "../crypto/merkle.js";
import { chainConfig } from "../config.js";
import type { PrivateStore } from "../private/store.js";
import type pg from "pg";
import type { TxEnvelope } from "../schema/types.js";
import type { ChainRow, LedgerConnector } from "./connector.js";
import { LedgerUnavailableError, TxIdAlreadyOnChainError } from "./errors.js";

// txHashOf now lives in the pure leaf module `crypto/txhash.ts` (so the on-device signing path can be
// browser-bundled without pulling this config-bearing module); re-exported to keep the surface stable.
export { txHashOf } from "../crypto/txhash.js";

/**
 * Accepts one transaction into the local POOL: it writes the raw content + exact envelope to the
 * private (mutable) Postgres store and atomically enqueues the commitment in the same Postgres
 * transaction (`record_outbox`, status `pending`), tagged with this chain's `chainId`. It does NOT
 * touch the append-only chain — the commitment reaches immudb only when {@link BlockSettler} settles
 * a block from the pool. So `append` returns as soon as the pool accepts the tx; settlement (and
 * external anchoring) run on their own cadence. Either both Postgres rows land or neither does, so a
 * crash can never orphan a record without a pending outbox row to settle it.
 *
 * Before pooling, `append` consults the ledger (`getEnvelope(txId)`): a `txId` already on immudb is
 * rejected even when Postgres no longer has it (outbox is not a durable mirror of the chain). Ledger
 * downtime fails closed — pool never proceeds without a successful existence check.
 *
 * A jurisdiction is 1:1 with a chain (docs/01 §6.0): the jurisdiction router (jurisdiction.ts) maps a
 * `jurisdictionId` to its `PublicChain`, whose `chainId` is that jurisdiction's id at the ledger
 * boundary. The ledger layer keeps the word "chain".
 */
export class PublicChain {
  constructor(
    private readonly store: PrivateStore,
    private readonly chainId: string = chainConfig.chainId,
    private readonly ledger: LedgerConnector,
    /** When set (API composition root), called before `getEnvelope` so lazy connect is shared with explorer. */
    private readonly ensureLedgerConnected?: () => Promise<void>,
  ) {}

  /** The entity's current head txHash (null if it has no transactions yet). */
  async currentHead(entityId: string): Promise<string | null> {
    const head = await this.store.getEntityHead(entityId);
    return head?.txHash ?? null;
  }

  async append(
    envelope: TxEnvelope,
    raw: { salt: string; content: unknown },
    project?: (client: pg.PoolClient, txHash: string) => Promise<void>,
  ): Promise<{ txHash: string }> {
    const envJson = canonicalJson(envelope);
    const txHash = hashLeaf(envJson);

    // The exact commitment row immudb receives — commitments + canonical envelope only, no plaintext.
    const chainRow: ChainRow = {
      txId: envelope.txId,
      type: envelope.type,
      entityId: envelope.entityId,
      op: envelope.op,
      parentType: envelope.parentType,
      parentId: envelope.parentId,
      parentRevisionHash: envelope.parentRevisionHash,
      authorPubkey: envelope.authorPubkey,
      signature: envelope.signature,
      createdAt: envelope.createdAt,
      prevHash: envelope.prevHash,
      contentHash: envelope.contentHash,
      txHash,
      envelope: envJson,
    };

    // Reject if this txId is already on the never-reset ledger (Postgres wipe ≠ ledger wipe).
    await this.assertTxIdFreeOnLedger(envelope.txId);

    // Atomic: the private record + its outbox entry land together (or not at all). The commitment
    // stays `pending` until a block is settled — no per-tx immudb write here.
    await this.store.appendTxAndEnqueue(
      {
        txId: envelope.txId,
        type: envelope.type,
        entityId: envelope.entityId,
        op: envelope.op,
        parentType: envelope.parentType,
        parentId: envelope.parentId,
        parentRevisionTxId: envelope.parentRevisionTxId,
        parentRevisionHash: envelope.parentRevisionHash,
        authorPubkey: envelope.authorPubkey,
        signature: envelope.signature,
        createdAt: envelope.createdAt,
        prevHash: envelope.prevHash,
        contentHash: envelope.contentHash,
        nullifier: envelope.nullifier,
        txHash,
        envelope: envJson,
        salt: raw.salt,
        content: raw.content,
      },
      chainRow,
      this.chainId,
      project,
    );

    return { txHash };
  }

  /** Fail closed: ledger must answer; an existing envelope blocks pool. */
  private async assertTxIdFreeOnLedger(txId: string): Promise<void> {
    try {
      if (this.ensureLedgerConnected) await this.ensureLedgerConnected();
      const existing = await this.ledger.getEnvelope(txId);
      if (existing !== undefined) throw new TxIdAlreadyOnChainError(txId);
    } catch (err) {
      if (err instanceof TxIdAlreadyOnChainError) throw err;
      if (err instanceof LedgerUnavailableError) throw err;
      throw new LedgerUnavailableError(err);
    }
  }
}
