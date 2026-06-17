import { randomUUID } from "node:crypto";
import { expect } from "chai";
import pg from "pg";
import { pgConfig } from "../src/config.js";
import { PublicChain } from "../src/ledger/chain.js";
import type { ChainRow, LedgerConnector, LedgerRoot, RowVerification } from "../src/ledger/connector.js";
import { OutboxRelay } from "../src/ledger/outbox.js";
import { RecordService } from "../src/record.js";
import { verifyEntityChain } from "../src/verify.js";
import { getWorld } from "./helpers/world.js";

/** Read one outbox row's status directly (the relay marks it 'sent' after immudb gets the commitment). */
async function outboxStatus(txId: string): Promise<string | undefined> {
  const raw = new pg.Client(pgConfig);
  await raw.connect();
  try {
    const r = await raw.query(`SELECT status FROM record_outbox WHERE tx_id = $1`, [txId]);
    return r.rows.length === 0 ? undefined : (r.rows[0].status as string);
  } finally {
    await raw.end();
  }
}

async function recordTxExists(txId: string): Promise<boolean> {
  const raw = new pg.Client(pgConfig);
  await raw.connect();
  try {
    const r = await raw.query(`SELECT 1 FROM record_tx WHERE tx_id = $1`, [txId]);
    return r.rows.length > 0;
  } finally {
    await raw.end();
  }
}

/** A connector that fails every immudb write and reports nothing committed — simulates immudb down. */
class DownConnector implements LedgerConnector {
  readonly transport = "pgwire" as const;
  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  async appendTx(): Promise<void> {
    throw new Error("immudb unavailable");
  }
  async healthcheck(): Promise<boolean> {
    return false;
  }
  async getEnvelope(): Promise<string | undefined> {
    return undefined;
  }
  async state(): Promise<LedgerRoot> {
    throw new Error("immudb unavailable");
  }
  async verifyRow(): Promise<RowVerification> {
    throw new Error("immudb unavailable");
  }
}

/**
 * Wraps the real connector but fails the first `failAppends` writes and returns a scripted
 * `healthSequence` (the last value repeats) — drives the relay's healthcheck-gated retry policy
 * while still landing the eventual write in the real immudb so the chain verifies.
 */
class FlakyConnector implements LedgerConnector {
  readonly transport = "pgwire" as const;
  appendCalls = 0;
  healthCalls = 0;
  constructor(
    private readonly real: LedgerConnector,
    private readonly failAppends: number,
    private readonly healthSequence: boolean[],
  ) {}
  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  async appendTx(row: ChainRow): Promise<void> {
    this.appendCalls += 1;
    if (this.appendCalls <= this.failAppends) throw new Error("immudb append failed (flaky)");
    return this.real.appendTx(row);
  }
  async healthcheck(): Promise<boolean> {
    const i = this.healthCalls++;
    return this.healthSequence[Math.min(i, this.healthSequence.length - 1)];
  }
  getEnvelope(txId: string): Promise<string | undefined> {
    return this.real.getEnvelope(txId);
  }
  state(): Promise<LedgerRoot> {
    return this.real.state();
  }
  verifyRow(txId: string): Promise<RowVerification> {
    return this.real.verifyRow(txId);
  }
}

/** A fast policy for tests — no real minutes-long waits; `sleeps` counts the back-off calls. */
const fastCfg = { retryAttempts: 3, healthcheckWaitMs: 0, healthcheckAttempts: 3 };

/** The transactional outbox makes the Postgres → immudb write durable across a crash between them. */
describe("10 outbox: durable two-store writes", () => {
  it("atomically enqueues on append and relays immediately (happy path)", async () => {
    const { svc, connector } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "outbox v1" } });

    expect(await recordTxExists(post.txId), "record_tx written").to.equal(true);
    expect(await outboxStatus(post.txId), "outbox marked sent after immediate relay").to.equal("sent");
    expect(await connector.getEnvelope(post.txId), "immudb holds the commitment").to.not.equal(undefined);
  });

  it("recovers an orphaned write: pending → flushOutbox → chain verifies", async () => {
    const { store, connector } = await getWorld();

    // Append through a chain whose immudb is "down": the private row + outbox row commit, but the
    // immediate relay fails, leaving the commitment un-delivered — exactly the crash the report names.
    const downChain = new PublicChain(new DownConnector(), store);
    const downSvc = new RecordService(downChain, store);
    const post = await downSvc.create({ type: "post", author: "bob", content: { body: "orphan" } });

    expect(await recordTxExists(post.txId), "private row persisted").to.equal(true);
    expect(await outboxStatus(post.txId), "outbox still pending").to.equal("pending");
    expect(await connector.getEnvelope(post.txId), "immudb does NOT have it yet").to.equal(undefined);

    // Verification must FAIL while the commitment is missing (throw or ok:false both count).
    let verifiedBefore = false;
    try {
      verifiedBefore = (await verifyEntityChain(store, connector, post.entityId)).ok;
    } catch {
      verifiedBefore = false;
    }
    expect(verifiedBefore, "chain cannot verify with the commitment missing").to.equal(false);

    // Recovery sweep against the real immudb delivers the pending commitment.
    const result = await new OutboxRelay(store, connector).flushOutbox();
    expect(result.sent, "at least the orphan was relayed").to.be.greaterThan(0);

    expect(await outboxStatus(post.txId), "outbox now sent").to.equal("sent");
    expect(await connector.getEnvelope(post.txId), "immudb now holds the commitment").to.not.equal(undefined);

    const report = await verifyEntityChain(store, connector, post.entityId);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
  });

  it("is idempotent: a second flush, and a pre-delivered commitment, never double-write", async () => {
    const { store, connector } = await getWorld();

    // Create an orphan (outbox pending, immudb missing) via the down chain.
    const downChain = new PublicChain(new DownConnector(), store);
    const downSvc = new RecordService(downChain, store);
    const post = await downSvc.create({ type: "post", author: "carol", content: { body: "idem" } });

    // Simulate "immudb INSERT succeeded but the outbox was never marked sent" (crash in between):
    // deliver the commitment out of band, leaving the outbox row pending.
    const [pending] = (await store.getPendingOutbox()).filter((p) => p.txId === post.txId);
    expect(pending, "the pending payload is available").to.not.equal(undefined);
    await connector.appendTx(pending.payload);

    // flushOutbox must NOT attempt a duplicate insert (would violate immudb's PRIMARY KEY); the
    // getEnvelope guard detects the commitment is already present and just marks the row sent.
    const relay = new OutboxRelay(store, connector);
    await relay.flushOutbox();
    expect(await outboxStatus(post.txId), "marked sent via the idempotency guard").to.equal("sent");

    // A second sweep is a no-op and still does not throw.
    const second = await relay.flushOutbox();
    expect(second.failed).to.equal(0);

    // Backstop: a raw duplicate append of the same row WOULD throw — proving idempotency mattered.
    let dupThrew = false;
    try {
      await connector.appendTx(pending.payload);
    } catch {
      dupThrew = true;
    }
    expect(dupThrew, "immudb rejects a duplicate tx_id").to.equal(true);
  });

  it("rolls back the private write when the outbox enqueue fails (true atomicity)", async () => {
    const { store } = await getWorld();
    const txId = randomUUID();
    const entityId = randomUUID();

    const input = {
      txId,
      type: "post" as const,
      entityId,
      op: "create" as const,
      authorPubkey: "dave",
      signature: "unsigned",
      createdAt: new Date().toISOString(),
      prevHash: null,
      contentHash: "deadbeef",
      txHash: "cafe",
      envelope: "{}",
      salt: "00",
      content: { body: "rollback" },
    };

    // Force the outbox INSERT to fail (payload is NOT NULL) AFTER the record_tx INSERT in the same
    // transaction. The whole transaction must roll back — neither row may survive.
    let threw = false;
    try {
      await store.appendTxAndEnqueue(input, undefined as unknown as ChainRow);
    } catch {
      threw = true;
    }
    expect(threw, "the enqueue failure surfaced").to.equal(true);

    expect(await recordTxExists(txId), "record_tx rolled back").to.equal(false);
    expect(await outboxStatus(txId), "no outbox row").to.equal(undefined);
    expect(await store.getEntityState(entityId), "no folded state").to.equal(undefined);
  });

  /** Create an orphan (private row + pending outbox, immudb missing) and return its pending payload. */
  async function makeOrphan(store: Awaited<ReturnType<typeof getWorld>>["store"], author: string) {
    const downSvc = new RecordService(new PublicChain(new DownConnector(), store), store);
    const ref = await downSvc.create({ type: "post", author, content: { body: `orphan-${author}` } });
    const [pending] = (await store.getPendingOutbox()).filter((p) => p.txId === ref.txId);
    return { ref, payload: pending.payload };
  }

  it("retries while immudb is healthy until the relay lands (retryAttempts)", async () => {
    const { store, connector } = await getWorld();
    const { ref, payload } = await makeOrphan(store, "erin");

    // Healthy throughout, but the first two writes fail — the retry loop must keep going.
    const flaky = new FlakyConnector(connector, 2, [true]);
    let sleeps = 0;
    const relay = new OutboxRelay(store, flaky, fastCfg, async () => void sleeps++);

    const outcome = await relay.relayWithRetry(ref.txId, payload);
    expect(outcome.delivered, "eventually delivered").to.equal(true);
    expect(flaky.appendCalls, "two failures + one success").to.equal(3);
    expect(sleeps, "no back-off needed while healthy").to.equal(0);
    expect(await outboxStatus(ref.txId)).to.equal("sent");
    expect((await verifyEntityChain(store, connector, ref.entityId)).ok).to.equal(true);
  });

  it("backs off and re-healthchecks while immudb is down, then delivers on recovery", async () => {
    const { store, connector } = await getWorld();
    const { ref, payload } = await makeOrphan(store, "frank");

    // First write fails; immudb then reports down twice before recovering on the third check.
    const flaky = new FlakyConnector(connector, 1, [false, false, true]);
    let sleeps = 0;
    const relay = new OutboxRelay(store, flaky, fastCfg, async () => void sleeps++);

    const outcome = await relay.relayWithRetry(ref.txId, payload);
    expect(outcome.delivered).to.equal(true);
    expect(sleeps, "waited once per failed healthcheck before recovery").to.equal(2);
    expect(await outboxStatus(ref.txId)).to.equal("sent");
    expect((await verifyEntityChain(store, connector, ref.entityId)).ok).to.equal(true);
  });

  it("gives up after healthcheckAttempts and leaves the row pending; flushOutbox bails", async () => {
    const { store } = await getWorld();
    const { ref } = await makeOrphan(store, "grace");
    const [pending] = (await store.getPendingOutbox()).filter((p) => p.txId === ref.txId);

    const down = new DownConnector();
    let sleeps = 0;
    const relay = new OutboxRelay(store, down, fastCfg, async () => void sleeps++);

    const outcome = await relay.relayWithRetry(ref.txId, pending.payload);
    expect(outcome.delivered).to.equal(false);
    expect(outcome.gaveUpUnhealthy, "stopped because immudb stayed down").to.equal(true);
    expect(sleeps, "waited between healthchecks, not after the final one").to.equal(2);
    expect(await outboxStatus(ref.txId), "row remains pending for the next sweep").to.equal("pending");

    const result = await relay.flushOutbox();
    expect(result.failed, "the sweep reports the undelivered row and bails").to.be.greaterThan(0);
  });

  it("0 means indefinite: keeps re-healthchecking past the finite limit until recovery", async () => {
    const { store, connector } = await getWorld();
    const { ref, payload } = await makeOrphan(store, "heidi");

    // Down for FOUR checks — a finite limit of 3 would give up, but 0 = indefinite must hold on.
    const flaky = new FlakyConnector(connector, 1, [false, false, false, false, true]);
    let sleeps = 0;
    const relay = new OutboxRelay(
      store,
      flaky,
      { retryAttempts: 0, healthcheckWaitMs: 0, healthcheckAttempts: 0 },
      async () => void sleeps++,
    );

    const outcome = await relay.relayWithRetry(ref.txId, payload);
    expect(outcome.delivered, "never gave up despite > 3 down checks").to.equal(true);
    expect(flaky.healthCalls, "kept checking until immudb returned").to.equal(5);
    expect(await outboxStatus(ref.txId)).to.equal("sent");
  });
});
