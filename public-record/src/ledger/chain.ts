import { canonicalJson } from "../crypto/commitment.js";
import { hashLeaf } from "../crypto/merkle.js";
import type { PrivateStore } from "../private/store.js";
import type { TxEnvelope } from "../schema/types.js";
import type { ChainRow, LedgerConnector } from "./connector.js";
import { OutboxRelay } from "./outbox.js";

/** The transaction hash = hash of the canonical envelope. It is this revision's identity and
 *  the value the next same-entity transaction references as `prevHash`. */
export function txHashOf(envelope: TxEnvelope): string {
  return hashLeaf(canonicalJson(envelope));
}

/**
 * Writes one transaction to BOTH stores: the raw content + exact envelope to the private
 * (mutable) Postgres store, and the commitment row to the public (append-only) immudb chain.
 *
 * Durability comes from a transactional outbox: the private write atomically enqueues the
 * commitment (same Postgres transaction), then we relay it to immudb. A crash, an immudb outage,
 * or a thrown relay can never orphan a record — the pending outbox row is completed by a later
 * `flushOutbox()` sweep, idempotently. The immediate relay below is a happy-path optimization so
 * immudb is current the moment `append` returns; correctness does not depend on it.
 */
export class PublicChain {
  private readonly relay: OutboxRelay;

  constructor(
    private readonly connector: LedgerConnector,
    private readonly store: PrivateStore,
  ) {
    this.relay = new OutboxRelay(store, connector);
  }

  /** Drain any commitments not yet relayed to immudb (recovery sweep). */
  async flushOutbox(): Promise<{ sent: number; failed: number }> {
    return this.relay.flushOutbox();
  }

  /** The entity's current head txHash (null if it has no transactions yet). */
  async currentHead(entityId: string): Promise<string | null> {
    const head = await this.store.getEntityHead(entityId);
    return head?.txHash ?? null;
  }

  async append(envelope: TxEnvelope, raw: { salt: string; content: unknown }): Promise<{ txHash: string }> {
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

    // Atomic: the private record + its outbox entry land together (or not at all).
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
        txHash,
        envelope: envJson,
        salt: raw.salt,
        content: raw.content,
      },
      chainRow,
    );

    // Best-effort immediate relay so immudb is current on return. relayOne never throws — on
    // failure the outbox row stays pending and a later flushOutbox() completes it.
    await this.relay.relayOne(envelope.txId, chainRow);

    return { txHash };
  }
}
