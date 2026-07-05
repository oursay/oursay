// SettlementWorker — the deadline-aware loop that drives settlement + anchoring for a SET of chains.
//
// It owns NO connections and constructs NO crypto: each chain is handed in as a ChainRunner wrapping
// an existing BlockSettler + AnchorPublisher + AnchorTarget (no second settlement implementation —
// docs/01 §3.4: pool → settle → publish). That makes the loop unit-testable with fakes and a
// controllable clock/sleeper, no real timers and no DB.
//
// Per tick, for each chain SERIALLY (the settler is single-proposer-per-chain, so never overlap):
//   1. drain eligible blocks  — `while (maybeSettleBlock() !== null)` (trigger-gated, maxBlockTxs cap)
//   2. publish on cadence     — `maybePublish(target)` (the target's everyNBlocks policy)
//   3. record the trigger state (pendingCount / oldestAgeMs) to schedule the next wake
// The loop then sleeps until the nearest age-deadline across chains, clamped to [minIntervalMs,
// maxIdleMs]. `maxIdleMs` is the polling floor that catches the COUNT trigger between writes — the
// stand-in for a future Postgres LISTEN/NOTIFY wake (a seam, not built here).

import type { BlockConfig } from "../config.js";
import type { BlockHeader } from "../ledger/connector.js";
import type { SettleDecision } from "../ledger/settler.js";
import type { AnchorTarget } from "../anchor/target.js";

/** The slice of BlockSettler the worker depends on (structural, so tests can pass fakes). */
export interface SettlerLike {
  maybeSettleBlock(opts?: { now?: number }): Promise<BlockHeader | null>;
  evaluateTrigger(now?: number): Promise<SettleDecision>;
}

/** The slice of AnchorPublisher the worker depends on. */
export interface PublisherLike {
  maybePublish(target: AnchorTarget): Promise<number[]>;
}

/** One chain's settlement + anchoring wiring. The worker drives each runner independently. */
export interface ChainRunner {
  chainId: string;
  settler: SettlerLike;
  publisher: PublisherLike;
  target: AnchorTarget;
  /** This chain's settlement config — the worker needs `maxPendingAgeMs`/`minTxs` for scheduling. */
  blockConfig: BlockConfig;
}

/** Minimal logger (console satisfies it). */
export interface Logger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** A cancellable sleeper: `wake()` resolves any in-flight `sleep()` early (for graceful stop + tests). */
export interface Sleeper {
  sleep(ms: number): Promise<void>;
  wake(): void;
}

/** Real-timer sleeper; `wake()` clears the pending timeout and resolves immediately. */
export function realSleeper(): Sleeper {
  let resolve: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const settle = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    const r = resolve;
    resolve = null;
    r?.();
  };
  return {
    sleep(ms: number) {
      return new Promise<void>((res) => {
        resolve = res;
        timer = setTimeout(settle, ms);
      });
    },
    wake: settle,
  };
}

/** Post-tick scheduling input for one chain. */
export interface ChainDecision {
  chainId: string;
  pendingCount: number;
  oldestAgeMs: number | null;
  maxPendingAgeMs: number;
  minTxs: number;
}

export interface TickSummary {
  decisions: ChainDecision[];
  settled: { chainId: string; blockHeight: number; txCount: number }[];
  published: { chainId: string; heights: number[] }[];
}

export interface SettlementWorkerOptions {
  runners: ChainRunner[];
  maxIdleMs: number;
  minIntervalMs: number;
  now?: () => number;
  sleeper?: Sleeper;
  log?: Logger;
}

export class SettlementWorker {
  private readonly runners: ChainRunner[];
  private readonly maxIdleMs: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleeper: Sleeper;
  private readonly log: Logger;
  private stopped = false;

  constructor(o: SettlementWorkerOptions) {
    this.runners = o.runners;
    this.maxIdleMs = o.maxIdleMs;
    this.minIntervalMs = o.minIntervalMs;
    this.now = o.now ?? (() => Date.now());
    this.sleeper = o.sleeper ?? realSleeper();
    this.log = o.log ?? console;
  }

  /** One pass over every chain: drain → publish → record trigger state. Never throws (per-chain catch). */
  async tick(): Promise<TickSummary> {
    const summary: TickSummary = { decisions: [], settled: [], published: [] };
    for (const r of this.runners) {
      try {
        // (1) Drain: settle every block the trigger currently allows (each capped at maxBlockTxs).
        for (;;) {
          const header = await r.settler.maybeSettleBlock({ now: this.now() });
          if (header === null) break;
          summary.settled.push({ chainId: r.chainId, blockHeight: header.blockHeight, txCount: header.txCount });
          this.log.log(`[worker] settled ${r.chainId} block ${header.blockHeight} (${header.txCount} tx)`);
        }
        // (2) Publish settled-but-unpublished blocks on the target's own cadence.
        const heights = await r.publisher.maybePublish(r.target);
        if (heights.length > 0) {
          summary.published.push({ chainId: r.chainId, heights });
          this.log.log(`[worker] published ${r.chainId} block(s) ${JSON.stringify(heights)}`);
        }
        // (3) Record the post-drain trigger state to schedule the next wake.
        const d = await r.settler.evaluateTrigger(this.now());
        summary.decisions.push(this.decisionOf(r, d.pendingCount, d.oldestAgeMs));
      } catch (err) {
        // One chain's immudb-down retry/error must not kill the loop or starve the other chains.
        // Keep it scheduled at the idle cadence so it retries on the next wake.
        this.log.error(`[worker] chain ${r.chainId} tick failed:`, err);
        summary.decisions.push(this.decisionOf(r, 0, null));
      }
    }
    return summary;
  }

  private decisionOf(r: ChainRunner, pendingCount: number, oldestAgeMs: number | null): ChainDecision {
    return {
      chainId: r.chainId,
      pendingCount,
      oldestAgeMs,
      maxPendingAgeMs: r.blockConfig.maxPendingAgeMs,
      minTxs: r.blockConfig.minTxs,
    };
  }

  /**
   * Milliseconds until the next tick. The nearest AGE deadline across chains (a chain contributes one
   * only when it has `>= minTxs` pending below the age threshold and the age trigger is enabled),
   * clamped to `[minIntervalMs, maxIdleMs]`.
   *
   * Count-trigger safety: chains with no pending — or pending below `minTxs` — contribute NO deadline,
   * so `min` can be `Infinity`; the `maxIdleMs` clamp guarantees the loop still wakes to re-check the
   * COUNT trigger between writes (the LISTEN/NOTIFY stand-in). Pinned by a unit test so it can't regress.
   */
  computeNextWakeMs(decisions: ChainDecision[]): number {
    let nearest = Infinity;
    for (const d of decisions) {
      if (d.maxPendingAgeMs > 0 && d.pendingCount >= d.minTxs && d.oldestAgeMs !== null) {
        const untilAgeDeadline = Math.max(0, d.maxPendingAgeMs - d.oldestAgeMs);
        if (untilAgeDeadline < nearest) nearest = untilAgeDeadline;
      }
    }
    return Math.min(this.maxIdleMs, Math.max(this.minIntervalMs, nearest));
  }

  /** Run until {@link stop} is called. Serial loop ⇒ ticks never overlap. */
  async run(): Promise<void> {
    this.log.log(
      `[worker] starting: ${this.runners.length} chain(s) [${this.runners.map((r) => r.chainId).join(", ")}], ` +
        `maxIdle=${this.maxIdleMs}ms minInterval=${this.minIntervalMs}ms`,
    );
    while (!this.stopped) {
      const summary = await this.tick();
      if (this.stopped) break;
      await this.sleeper.sleep(this.computeNextWakeMs(summary.decisions));
    }
    this.log.log("[worker] loop stopped");
  }

  /** Stop after the in-flight tick completes (never mid-settlement); wakes a pending sleep early. */
  stop(): void {
    this.stopped = true;
    this.sleeper.wake();
  }
}
