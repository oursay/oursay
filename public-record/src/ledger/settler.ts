import {
  type BlockConfig,
  type OutboxConfig,
  blockConfig,
  chainConfig,
  outboxConfig,
} from "../config.js";
import { computeChainTipHash } from "../anchor/verify.js";
import { hashLeaf, merkleRoot } from "../crypto/merkle.js";
import type { PrivateStore } from "../private/store.js";
import type { BlockHeader, ChainRow, LedgerConnector } from "./connector.js";

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Why a settlement fired (or did not) — surfaced for callers/tests; `null` when nothing to do. */
export interface SettleDecision {
  shouldSettle: boolean;
  reason: "count" | "age" | null;
  pendingCount: number;
  oldestAgeMs: number | null;
}

export interface SettleOptions {
  /** Injected wall-clock for the age trigger (tests). Defaults to `Date.now()`. */
  now?: number;
  /** Injected block timestamp (tests). Reuse the same value when asserting the next chain link. */
  capturedAt?: string;
}

/**
 * The SETTLEMENT boundary: drains the Postgres pending pool into a block committed to the append-only
 * chain (a batch of commitment rows + a block header), then clears the pool. This replaces the old
 * per-tx immudb relay — `PublicChain.append` now only enqueues; the record reaches the chain in
 * agreed blocks, not one row at a time. The block tip lives on immudb (keyed by `chainId`), so the
 * next block chains deterministically onto the last.
 *
 * Crash-safe and idempotent. The write order is: (1) batch-append commitments (idempotent — already
 * present rows are skipped), (2) append the header (idempotent on `(chainId, height)`), (3) mark the
 * pool sent. A crash at any point leaves the rows pending and a re-run completes them without
 * double-writing. The rare "header landed but pool not yet marked" case is reconciled up front:
 * pending rows already covered by the settled tip are marked sent rather than re-blocked.
 *
 * Resilient: a failed chain append triggers the same healthcheck-gated retry policy as the old relay
 * (default "3-3-3", see {@link OutboxConfig}; `0` = indefinite). If immudb stays unreachable the
 * settle throws and the pool is left intact for the next attempt.
 *
 * Single proposer (stage 1): settlement is NOT concurrency-safe — there is no lock between reading
 * the tip (`fetchLatestBlock`) and writing the header (`appendBlock`), so exactly one settler per
 * `chainId` must run at a time. Concurrent proposers are a stage-2 consensus concern (doc 07 §4/§5),
 * not a single-custodian one. The settler only ever drains/commits its own `chainId`, so a shared
 * Postgres pool / shared immudb can host other chains' settlers without interference.
 */
export class BlockSettler {
  constructor(
    private readonly store: PrivateStore,
    private readonly connector: LedgerConnector,
    private readonly chainId: string = chainConfig.chainId,
    private readonly cfg: BlockConfig = blockConfig,
    private readonly retry: OutboxConfig = outboxConfig,
    private readonly sleep: (ms: number) => Promise<void> = realSleep,
  ) {}

  /**
   * The trigger decision: settle when there is ≥ `minTxs` pending AND (count ≥ N OR oldest age ≥ X).
   * Pure read — performs no writes. `now` defaults to the wall clock (cadence only; never ordering).
   */
  async evaluateTrigger(now: number = Date.now()): Promise<SettleDecision> {
    const { count, oldestEnqueuedAt } = await this.store.getPendingPoolStats(this.chainId);
    const oldestAgeMs = oldestEnqueuedAt === null ? null : now - Date.parse(oldestEnqueuedAt);
    if (count < this.cfg.minTxs) {
      return { shouldSettle: false, reason: null, pendingCount: count, oldestAgeMs };
    }
    const countHit = this.cfg.maxPending > 0 && count >= this.cfg.maxPending;
    const ageHit =
      this.cfg.maxPendingAgeMs > 0 && oldestAgeMs !== null && oldestAgeMs >= this.cfg.maxPendingAgeMs;
    const reason = countHit ? "count" : ageHit ? "age" : null;
    return { shouldSettle: reason !== null, reason, pendingCount: count, oldestAgeMs };
  }

  /** Settle the next block IF the trigger fires; otherwise return null without touching the chain. */
  async maybeSettleBlock(opts: SettleOptions = {}): Promise<BlockHeader | null> {
    const decision = await this.evaluateTrigger(opts.now ?? Date.now());
    return decision.shouldSettle ? this.settleBlock(opts) : null;
  }

  /**
   * Force-settle the next block from the pending pool (up to `maxBlockTxs`), ignoring the count/age
   * triggers. Returns the settled header, or null if nothing is pending. Used by recovery and seed.
   */
  async settleBlock(opts: SettleOptions = {}): Promise<BlockHeader | null> {
    const prev = await this.connector.fetchLatestBlock(this.chainId);
    const fromSeq = prev?.toSeq ?? 0;

    // Find the next genuine batch (seq > fromSeq), reconciling any already-settled rows (seq ≤
    // fromSeq) that a crash AFTER the header but BEFORE the pool-mark left marked-pending. We LOOP
    // so a full reconcile window (≥ maxBlockTxs already-settled rows) can't stall the drain: each
    // pass marks those rows sent, and the next query excludes them and reaches the fresh ones (F1).
    let batch: { txId: string; seq: number; payload: ChainRow }[] = [];
    for (;;) {
      const pending = await this.store.getPendingForSettlement(this.chainId, this.cfg.maxBlockTxs);
      if (pending.length === 0) return null;
      const alreadySettled = pending.filter((p) => p.seq <= fromSeq);
      const fresh = pending.filter((p) => p.seq > fromSeq);
      if (alreadySettled.length > 0) {
        await this.store.markOutboxSentBatch(alreadySettled.map((p) => p.txId));
      }
      if (fresh.length > 0) {
        batch = fresh;
        break;
      }
      if (alreadySettled.length === 0) return null; // nothing new and nothing left to reconcile
      // else: the whole window was reconcile rows — loop; they are now 'sent' and excluded next pass.
    }

    const toSeq = batch[batch.length - 1].seq;
    // Leaves over the EXACT canonical envelopes in seq order — identical to the offline verifier.
    const leaves = batch.map((p) => hashLeaf(p.payload.envelope));
    const bundleMerkleRoot = merkleRoot(leaves);

    // (1) Commit the commitments (idempotent), with the immudb-down retry policy. Capture the ledger
    // root AFTER the batch lands so the header witnesses the post-append state.
    await this.appendBatchWithRetry(batch.map((p) => p.payload));
    const immu = await this.connector.state();

    const prevChainTipHash = prev?.chainTipHash ?? null;
    const header: BlockHeader = {
      chainId: this.chainId,
      blockHeight: (prev?.blockHeight ?? 0) + 1,
      fromSeq,
      toSeq,
      txCount: batch.length,
      bundleMerkleRoot,
      chainTipHash: computeChainTipHash(prevChainTipHash, bundleMerkleRoot),
      prevBlockRoot: prev?.bundleMerkleRoot ?? null,
      prevChainTipHash,
      immudbRoot: { db: immu.db, txId: immu.txId, txHashHex: immu.txHashHex },
      proposer: null, // reserved (doc 07 §4): single-custodian stage 1 settles unsigned
      attestations: [], // reserved: the custodian-quorum signature set attaches here in stage 2
      capturedAt: opts.capturedAt ?? new Date().toISOString(),
    };

    // (2) Commit the header, then (3) clear the pool. Only now is the block durable on the chain.
    await this.connector.appendBlock(header);
    await this.store.markOutboxSentBatch(batch.map((p) => p.txId));
    return header;
  }

  /**
   * Settle ALL currently-pending txs, one block per `maxBlockTxs`, ignoring the triggers. The
   * recovery sweep (orphaned pending after a crash) and the seed/demo path. Returns the headers.
   */
  async flushPendingSettlement(opts: SettleOptions = {}): Promise<BlockHeader[]> {
    const headers: BlockHeader[] = [];
    for (;;) {
      const header = await this.settleBlock(opts);
      if (header === null) break;
      headers.push(header);
    }
    return headers;
  }

  /**
   * Append the block's commitments with the healthcheck-gated retry policy: one immediate attempt;
   * on failure, if immudb is healthy retry up to `retryAttempts` times (0 = indefinite); if it is
   * down, back off `healthcheckWaitMs` and re-healthcheck up to `healthcheckAttempts` times (0 =
   * indefinite), resuming as soon as it recovers. Throws if it ultimately cannot deliver — the pool
   * is left intact for the next settle. `appendTxBatch` is idempotent, so retries never double-write.
   */
  private async appendBatchWithRetry(rows: ChainRow[]): Promise<void> {
    if (await this.tryAppend(rows)) return;

    const { retryAttempts, healthcheckAttempts, healthcheckWaitMs } = this.retry;
    let healthFailures = 0;
    for (;;) {
      if (await this.connector.healthcheck()) {
        healthFailures = 0;
        for (let attempt = 0; retryAttempts === 0 || attempt < retryAttempts; attempt++) {
          if (await this.tryAppend(rows)) return;
        }
        throw new Error("settlement append failed repeatedly while immudb was healthy");
      }
      healthFailures += 1;
      if (healthcheckAttempts !== 0 && healthFailures >= healthcheckAttempts) {
        throw new Error("settlement append gave up: immudb unreachable");
      }
      await this.sleep(healthcheckWaitMs);
    }
  }

  private async tryAppend(rows: ChainRow[]): Promise<boolean> {
    try {
      await this.connector.appendTxBatch(this.chainId, rows);
      return true;
    } catch {
      return false;
    }
  }
}
