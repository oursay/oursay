import { type OutboxConfig, outboxConfig } from "../config.js";
import type { PrivateStore } from "../private/store.js";
import type { ChainRow, LedgerConnector } from "./connector.js";

/** Outcome of relaying one commitment, with enough detail for the sweep to decide whether to go on. */
interface RelayOutcome {
  delivered: boolean;
  /** True when we stopped because immudb stayed unreachable (not because this row is bad). */
  gaveUpUnhealthy: boolean;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Relays pending commitments from the Postgres outbox to the append-only immudb chain.
 *
 * The enqueue (PrivateStore.appendTxAndEnqueue) is atomic with the private record write, so every
 * committed record_tx has a matching outbox row. This relay drains those rows to immudb and is the
 * piece that makes the two-store write durable across a crash: anything left `pending` after a
 * failure is completed by a later `flushOutbox()` sweep.
 *
 * Delivery is **idempotent** — re-running a sweep, or relaying a row whose commitment already
 * reached immudb (crash after the immudb INSERT but before the outbox was marked sent), never
 * double-writes. immudb's `PRIMARY KEY (tx_id)` is the backstop; `getEnvelope` is the guard.
 *
 * Delivery is also **resilient**: when a relay fails, `relayWithRetry` healthchecks immudb and
 * applies the configured retry policy (default "3-3-3", see {@link OutboxConfig}) — retry while
 * healthy, back off and re-healthcheck while down, with `0` meaning indefinite.
 */
export class OutboxRelay {
  constructor(
    private readonly store: PrivateStore,
    private readonly connector: LedgerConnector,
    private readonly cfg: OutboxConfig = outboxConfig,
    private readonly sleep: (ms: number) => Promise<void> = realSleep,
  ) {}

  /**
   * Relay a single commitment, one attempt, no retries. Returns true if immudb now holds it (just
   * relayed or already present), false if the attempt failed (the row stays pending). Used by the
   * append() fast path so a write never blocks on immudb.
   */
  async relayOne(txId: string, payload: ChainRow): Promise<boolean> {
    try {
      const existing = await this.connector.getEnvelope(txId);
      if (existing === undefined) {
        await this.connector.appendTx(payload);
      }
      await this.store.markOutboxSent(txId);
      return true;
    } catch (err) {
      await this.store.markOutboxFailed(txId, err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * Relay a single commitment with the healthcheck-gated retry policy:
   *   1. one immediate attempt;
   *   2. on failure, healthcheck immudb:
   *      - healthy  → retry up to `retryAttempts` times (0 = indefinitely until it lands);
   *      - unhealthy → wait `healthcheckWaitMs`, re-healthcheck up to `healthcheckAttempts` times
   *                    (0 = indefinitely), and resume retrying as soon as it recovers.
   */
  async relayWithRetry(txId: string, payload: ChainRow): Promise<RelayOutcome> {
    if (await this.relayOne(txId, payload)) return { delivered: true, gaveUpUnhealthy: false };

    const { retryAttempts, healthcheckAttempts, healthcheckWaitMs } = this.cfg;
    let healthFailures = 0;

    for (;;) {
      if (await this.connector.healthcheck()) {
        healthFailures = 0;
        for (let attempt = 0; retryAttempts === 0 || attempt < retryAttempts; attempt++) {
          if (await this.relayOne(txId, payload)) return { delivered: true, gaveUpUnhealthy: false };
        }
        // Healthy but the relay keeps failing — not an outage; stop so the sweep can move on.
        return { delivered: false, gaveUpUnhealthy: false };
      }

      healthFailures += 1;
      if (healthcheckAttempts !== 0 && healthFailures >= healthcheckAttempts) {
        return { delivered: false, gaveUpUnhealthy: true };
      }
      await this.sleep(healthcheckWaitMs);
    }
  }

  /**
   * Drain the pending outbox to immudb with the retry policy applied per row. Each row is attempted
   * at most once per sweep (a failed row keeps its place in the queue). If a row gives up because
   * immudb is persistently unreachable, the sweep stops early — the remaining rows stay pending for
   * the next sweep rather than each repeating the full back-off.
   */
  async flushOutbox(batchSize = 100): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    const attempted = new Set<string>();
    for (;;) {
      const pending = await this.store.getPendingOutbox(batchSize);
      const fresh = pending.filter((p) => !attempted.has(p.txId));
      if (fresh.length === 0) break;
      let stop = false;
      for (const { txId, payload } of fresh) {
        attempted.add(txId);
        const outcome = await this.relayWithRetry(txId, payload);
        if (outcome.delivered) {
          sent += 1;
        } else {
          failed += 1;
          if (outcome.gaveUpUnhealthy) {
            stop = true;
            break;
          }
        }
      }
      if (stop) break;
    }
    return { sent, failed };
  }
}
