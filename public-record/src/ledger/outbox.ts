import type { PrivateStore } from "../private/store.js";
import type { ChainRow, LedgerConnector } from "./connector.js";

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
 * double-writes. immudb's `PRIMARY KEY (tx_id)` is the backstop; `getEnvelope` is the guard that
 * avoids even attempting a duplicate insert.
 */
export class OutboxRelay {
  constructor(
    private readonly store: PrivateStore,
    private readonly connector: LedgerConnector,
  ) {}

  /**
   * Relay a single commitment. Returns true if immudb now holds it (just relayed or already
   * present), false if the attempt failed and the row remains pending for retry.
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
   * Drain the pending outbox to immudb. Safe to call repeatedly (e.g. on startup, or as a
   * recovery sweep after a crash). Each row is attempted at most once per sweep — a row that
   * fails keeps its place in the queue (markOutboxFailed leaves enqueued_at unchanged), so we
   * track attempted ids to avoid re-fetching and hot-looping it while other rows succeed.
   */
  async flushOutbox(batchSize = 100): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    const attempted = new Set<string>();
    for (;;) {
      const pending = await this.store.getPendingOutbox(batchSize);
      const fresh = pending.filter((p) => !attempted.has(p.txId));
      if (fresh.length === 0) break;
      for (const { txId, payload } of fresh) {
        attempted.add(txId);
        if (await this.relayOne(txId, payload)) sent += 1;
        else failed += 1;
      }
    }
    return { sent, failed };
  }
}
