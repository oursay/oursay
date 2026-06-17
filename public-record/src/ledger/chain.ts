import { canonicalJson } from "../crypto/commitment.js";
import { hashLeaf } from "../crypto/merkle.js";
import type { PrivateStore } from "../private/store.js";
import type { TxEnvelope } from "../schema/types.js";
import type { LedgerConnector } from "./connector.js";

/** The transaction hash = hash of the canonical envelope. It is this revision's identity and
 *  the value the next same-entity transaction references as `prevHash`. */
export function txHashOf(envelope: TxEnvelope): string {
  return hashLeaf(canonicalJson(envelope));
}

/**
 * Writes one transaction to BOTH stores: the raw content + exact envelope to the private
 * (mutable) Postgres store, and the commitment row to the public (append-only) immudb chain.
 *
 * Order mirrors the immudb-test ledger: private first (so raw content is retained), then the
 * append-only commitment. (A production system would make this atomic via an outbox; for this
 * dev harness the simple ordering is fine.)
 */
export class PublicChain {
  constructor(
    private readonly connector: LedgerConnector,
    private readonly store: PrivateStore,
  ) {}

  /** The entity's current head txHash (null if it has no transactions yet). */
  async currentHead(entityId: string): Promise<string | null> {
    const head = await this.store.getEntityHead(entityId);
    return head?.txHash ?? null;
  }

  async append(envelope: TxEnvelope, raw: { salt: string; content: unknown }): Promise<{ txHash: string }> {
    const envJson = canonicalJson(envelope);
    const txHash = hashLeaf(envJson);

    await this.store.appendTx({
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
    });

    await this.connector.appendTx({
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
    });

    return { txHash };
  }
}
