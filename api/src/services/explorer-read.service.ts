// Explorer / auditor READ surface over settled block headers (immudb) + private-store txs.
// Unauthenticated. Inefficient tip-walks are OK for MVP (etherscan-style, not bulk sync).
// Censorship: withhold content when redacted/erased (R17–R19); never return salt.

import type {
  BlockAttestation,
  BlockHeader,
  LedgerConnector,
  PrivateStore,
  RecordType,
  StoredTx,
} from "@oursay/public-record";
import { ServiceError } from "../errors.js";
import { decodeExplorerId, encodeExplorerId } from "../helpers/explorer-id.js";

export type ExplorerTxStatus = "pending" | "settled";
export type ExplorerBlockStatus = "settled";

export interface ExplorerTypeCounts {
  post?: number;
  comment?: number;
  reaction?: number;
  petition?: number;
  petition_signature?: number;
  poll?: number;
  vote?: number;
  result?: number;
}

/** Tip header slice — enough to recompute chainTipHash fold without a second block fetch. */
export interface ExplorerChainTip {
  height: number;
  chainTipHash: string;
  bundleMerkleRoot: string;
  prevBlockRoot: string | null;
  prevChainTipHash: string | null;
  immudbRoot: { db: string; txId: number; txHashHex: string };
  capturedAt: string;
  fromSeq: number;
  toSeq: number;
  txCount: number;
  proposer: string | null;
  attestations: BlockAttestation[];
}

export interface ExplorerChainView {
  chainId: string;
  tipHeight: number | null;
  tip: ExplorerChainTip | null;
  status: "empty" | "active";
  typeCounts: ExplorerTypeCounts;
  pendingTxCount: number;
}

export interface ExplorerBlockView {
  chainId: string;
  height: number;
  fromSeq: number;
  toSeq: number;
  txCount: number;
  bundleMerkleRoot: string;
  chainTipHash: string;
  prevBlockRoot: string | null;
  prevChainTipHash: string | null;
  immudbRoot: { db: string; txId: number; txHashHex: string };
  proposer: string | null;
  attestations: BlockAttestation[];
  capturedAt: string;
  status: ExplorerBlockStatus;
  typeCounts: ExplorerTypeCounts;
}

export interface ExplorerTxView {
  txId: string;
  seq: number;
  type: RecordType;
  op: string;
  entityId: string;
  parentType: string | null;
  parentId: string | null;
  authorPubkey: string;
  createdAt: string;
  contentHash: string;
  txHash: string;
  prevHash: string | null;
  blockHeight: number | null;
  status: ExplorerTxStatus;
  withheld: boolean;
  isRedacted: boolean;
  isErased: boolean;
  /** Present with content when not withheld — needed to recompute contentHash. Null when withheld. */
  salt: string | null;
  content: unknown | null;
  envelope: string;
}

export interface ExplorerDeps {
  store: PrivateStore;
  ledger: LedgerConnector;
  /** Ensures immudb is connected; throws ServiceError unavailable on failure. */
  ensureLedgerConnected: () => Promise<void>;
}

function typeCountsFromTxs(txs: StoredTx[]): ExplorerTypeCounts {
  const counts: ExplorerTypeCounts = {};
  for (const t of txs) {
    counts[t.type] = (counts[t.type] ?? 0) + 1;
  }
  return counts;
}

function toTxView(tx: StoredTx, blockHeight: number | null, status: ExplorerTxStatus): ExplorerTxView {
  const isRedacted = tx.redactedAt != null;
  const isErased = tx.erasedAt != null;
  const withheld = isRedacted || isErased;
  return {
    txId: encodeExplorerId(tx.txId),
    seq: tx.seq,
    type: tx.type,
    op: tx.op,
    entityId: encodeExplorerId(tx.entityId),
    parentType: tx.parentType,
    parentId: tx.parentId != null ? encodeExplorerId(tx.parentId) : null,
    authorPubkey: tx.authorPubkey,
    createdAt: tx.createdAt,
    contentHash: tx.contentHash,
    txHash: tx.txHash,
    prevHash: tx.prevHash,
    blockHeight,
    status,
    withheld,
    isRedacted,
    isErased,
    // Mirror BundleAssembler reveal: salt+content together, omitted when redacted/erased.
    salt: withheld ? null : tx.salt,
    content: withheld ? null : tx.content,
    envelope: tx.envelope,
  };
}

function toBlockView(header: BlockHeader, typeCounts: ExplorerTypeCounts): ExplorerBlockView {
  return {
    chainId: header.chainId,
    height: header.blockHeight,
    fromSeq: header.fromSeq,
    toSeq: header.toSeq,
    txCount: header.txCount,
    bundleMerkleRoot: header.bundleMerkleRoot,
    chainTipHash: header.chainTipHash,
    prevBlockRoot: header.prevBlockRoot,
    prevChainTipHash: header.prevChainTipHash,
    immudbRoot: header.immudbRoot,
    proposer: header.proposer,
    attestations: header.attestations,
    capturedAt: header.capturedAt,
    status: "settled",
    typeCounts,
  };
}

function toChainTip(header: BlockHeader): ExplorerChainTip {
  return {
    height: header.blockHeight,
    chainTipHash: header.chainTipHash,
    bundleMerkleRoot: header.bundleMerkleRoot,
    prevBlockRoot: header.prevBlockRoot,
    prevChainTipHash: header.prevChainTipHash,
    immudbRoot: header.immudbRoot,
    capturedAt: header.capturedAt,
    fromSeq: header.fromSeq,
    toSeq: header.toSeq,
    txCount: header.txCount,
    proposer: header.proposer,
    attestations: header.attestations,
  };
}

export class ExplorerReadService {
  constructor(private readonly d: ExplorerDeps) {}

  async getChain(chainId: string): Promise<ExplorerChainView> {
    await this.d.ensureLedgerConnected();
    const tip = await this.d.ledger.fetchLatestBlock(chainId);
    const typeCounts = await this.d.store.countSettledTxTypes(chainId);
    const pending = await this.d.store.getPendingPoolStats(chainId);
    if (!tip) {
      return {
        chainId,
        tipHeight: null,
        tip: null,
        status: "empty",
        typeCounts,
        pendingTxCount: pending.count,
      };
    }
    return {
      chainId,
      tipHeight: tip.blockHeight,
      tip: toChainTip(tip),
      status: "active",
      typeCounts,
      pendingTxCount: pending.count,
    };
  }

  async listBlocks(
    chainId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: ExplorerBlockView[]; tipHeight: number | null }> {
    await this.d.ensureLedgerConnected();
    const tip = await this.d.ledger.fetchLatestBlock(chainId);
    if (!tip) return { items: [], tipHeight: null };

    const items: ExplorerBlockView[] = [];
    // Newest-first tip-down walk; skip `offset` heights then take `limit`.
    for (let h = tip.blockHeight - opts.offset; h >= 1 && items.length < opts.limit; h--) {
      const header = await this.d.ledger.fetchBlockByHeight(chainId, h);
      if (!header) continue;
      const txs = await this.d.store.getTxsBySeqRange(chainId, header.fromSeq, header.toSeq);
      items.push(toBlockView(header, typeCountsFromTxs(txs)));
    }
    return { items, tipHeight: tip.blockHeight };
  }

  async getBlock(chainId: string, height: number): Promise<ExplorerBlockView> {
    await this.d.ensureLedgerConnected();
    if (!Number.isInteger(height) || height < 1) {
      throw new ServiceError("validation", "block height must be a positive integer");
    }
    const header = await this.d.ledger.fetchBlockByHeight(chainId, height);
    if (!header) throw new ServiceError("not_found", `block ${height} not found on chain ${chainId}`);
    const txs = await this.d.store.getTxsBySeqRange(chainId, header.fromSeq, header.toSeq);
    return toBlockView(header, typeCountsFromTxs(txs));
  }

  async listTxsByBlock(chainId: string, blockHeight: number): Promise<{ blockHeight: number; items: ExplorerTxView[] }> {
    await this.d.ensureLedgerConnected();
    if (!Number.isInteger(blockHeight) || blockHeight < 1) {
      throw new ServiceError("validation", "block must be a positive integer");
    }
    const header = await this.d.ledger.fetchBlockByHeight(chainId, blockHeight);
    if (!header) throw new ServiceError("not_found", `block ${blockHeight} not found on chain ${chainId}`);
    const txs = await this.d.store.getTxsBySeqRange(chainId, header.fromSeq, header.toSeq);
    return {
      blockHeight,
      items: txs.map((t) => toTxView(t, blockHeight, "settled")),
    };
  }

  async getTx(chainId: string, txIdRaw: string): Promise<ExplorerTxView> {
    await this.d.ensureLedgerConnected();
    let txId: string;
    try {
      txId = decodeExplorerId(txIdRaw);
    } catch {
      throw new ServiceError("validation", "invalid tx id (expected Base59 or UUID v4)");
    }
    const ref = await this.d.store.getTx(txId);
    if (!ref || ref.chainId !== chainId) {
      throw new ServiceError("not_found", `tx not found on chain ${chainId}`);
    }
    const status: ExplorerTxStatus = ref.outboxStatus === "sent" ? "settled" : "pending";
    const blockHeight =
      status === "settled" ? await this.findBlockHeightForSeq(chainId, ref.tx.seq) : null;
    return toTxView(ref.tx, blockHeight, status);
  }

  /** Walk tip → genesis for the header whose `(fromSeq, toSeq]` contains `seq`. MVP O(tip). */
  private async findBlockHeightForSeq(chainId: string, seq: number): Promise<number | null> {
    const tip = await this.d.ledger.fetchLatestBlock(chainId);
    if (!tip) return null;
    for (let h = tip.blockHeight; h >= 1; h--) {
      const header = await this.d.ledger.fetchBlockByHeight(chainId, h);
      if (!header) continue;
      if (seq > header.fromSeq && seq <= header.toSeq) return header.blockHeight;
    }
    return null;
  }
}
