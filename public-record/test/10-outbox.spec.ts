import { randomUUID } from "node:crypto";
import { expect } from "chai";
import pg from "pg";
import { blockConfig, pgConfig } from "../src/config.js";
import type {
  BlockHeader,
  ChainRow,
  LedgerConnector,
  LedgerRoot,
  RowVerification,
} from "../src/ledger/connector.js";
import { BlockSettler } from "../src/ledger/settler.js";
import { RecordService } from "../src/record.js";
import { verifyEntityChain } from "../src/verify.js";
import { getWorld } from "./helpers/world.js";

/** Read one outbox row's status directly. */
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

/** Force a settled outbox row back to pending — simulates a crash AFTER the header but BEFORE the mark. */
async function reopenOutbox(txId: string): Promise<void> {
  const raw = new pg.Client(pgConfig);
  await raw.connect();
  try {
    await raw.query(`UPDATE record_outbox SET status = 'pending', sent_at = NULL WHERE tx_id = $1`, [txId]);
  } finally {
    await raw.end();
  }
}

/** A connector whose immudb is unreachable: every chain op fails, nothing is committed. */
class DownConnector implements LedgerConnector {
  readonly transport = "pgwire" as const;
  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  async appendTx(): Promise<void> {
    throw new Error("immudb unavailable");
  }
  async appendTxBatch(): Promise<void> {
    throw new Error("immudb unavailable");
  }
  async appendBlock(): Promise<void> {
    throw new Error("immudb unavailable");
  }
  async fetchLatestBlock(): Promise<BlockHeader | undefined> {
    return undefined;
  }
  async fetchBlockByHeight(): Promise<BlockHeader | undefined> {
    return undefined;
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
 * Wraps the real connector but fails the first `failBatches` batch appends and returns a scripted
 * `healthSequence` (the last value repeats) — drives the settler's healthcheck-gated retry while
 * still landing the eventual batch in the real immudb so the chain verifies. All other ops delegate.
 */
class FlakyConnector implements LedgerConnector {
  readonly transport = "pgwire" as const;
  batchCalls = 0;
  healthCalls = 0;
  constructor(
    private readonly real: LedgerConnector,
    private readonly failBatches: number,
    private readonly healthSequence: boolean[],
  ) {}
  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  appendTx(row: ChainRow): Promise<void> {
    return this.real.appendTx(row);
  }
  async appendTxBatch(rows: ChainRow[]): Promise<void> {
    this.batchCalls += 1;
    if (this.batchCalls <= this.failBatches) throw new Error("immudb batch failed (flaky)");
    return this.real.appendTxBatch(rows);
  }
  appendBlock(header: BlockHeader): Promise<void> {
    return this.real.appendBlock(header);
  }
  fetchLatestBlock(chainId: string): Promise<BlockHeader | undefined> {
    return this.real.fetchLatestBlock(chainId);
  }
  fetchBlockByHeight(chainId: string, h: number): Promise<BlockHeader | undefined> {
    return this.real.fetchBlockByHeight(chainId, h);
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

/** A fast retry policy for tests — no real minutes-long waits; `sleeps` counts the back-off calls. */
const fastRetry = { retryAttempts: 3, healthcheckWaitMs: 0, healthcheckAttempts: 3 };

async function rejects(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

/**
 * `append` now only POOLS a tx (atomic record_tx + pending outbox); the commitment reaches the
 * append-only chain at block SETTLEMENT. These tests cover the pool→chain settlement: durability
 * across a crash, idempotency, and the healthcheck-gated retry while immudb is down.
 */
describe("10 settlement: durable pool → chain, idempotent and crash-safe", () => {
  let svc: RecordService;
  let store: Awaited<ReturnType<typeof getWorld>>["store"];
  let connector: Awaited<ReturnType<typeof getWorld>>["connector"];

  before(async () => {
    const w = await getWorld();
    svc = w.svc;
    store = w.store;
    connector = w.connector;
  });

  beforeEach(async () => {
    await store.reset(); // isolate each test's pool so settlement counts are deterministic
  });

  it("append only pools the tx; it reaches the chain on settlement", async () => {
    const post = await svc.create({ type: "post", author: "alice", content: { body: "pool v1" } });

    expect(await recordTxExists(post.txId), "record_tx written").to.equal(true);
    expect(await outboxStatus(post.txId), "pooled, not yet settled").to.equal("pending");
    expect(await connector.getEnvelope(post.txId), "chain does NOT have it before settlement").to.equal(undefined);

    const settler = new BlockSettler(store, connector, randomUUID(), blockConfig);
    const header = await settler.settleBlock();
    expect(header, "a block was settled").to.not.equal(null);
    expect(await outboxStatus(post.txId), "marked sent after settlement").to.equal("sent");
    expect(await connector.getEnvelope(post.txId), "chain now holds the commitment").to.not.equal(undefined);
  });

  it("recovers an orphaned pool tx: pending → settle → chain verifies", async () => {
    const post = await svc.create({ type: "post", author: "bob", content: { body: "orphan" } });

    // Verification must FAIL while the commitment is unsettled.
    let verifiedBefore = false;
    try {
      verifiedBefore = (await verifyEntityChain(store, connector, post.entityId)).ok;
    } catch {
      verifiedBefore = false;
    }
    expect(verifiedBefore, "chain cannot verify before settlement").to.equal(false);

    const settler = new BlockSettler(store, connector, randomUUID(), blockConfig);
    const headers = await settler.flushPendingSettlement();
    expect(headers.length, "the orphan was settled").to.be.greaterThan(0);

    expect(await outboxStatus(post.txId)).to.equal("sent");
    expect(await connector.getEnvelope(post.txId)).to.not.equal(undefined);
    const report = await verifyEntityChain(store, connector, post.entityId);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
  });

  it("is idempotent: a pre-delivered commitment and a re-settle never double-write", async () => {
    const post = await svc.create({ type: "post", author: "carol", content: { body: "idem" } });

    // Simulate "commitment already on the chain but outbox not yet marked" (crash between).
    const [mine] = (await store.getPendingForSettlement(100)).filter((p) => p.txId === post.txId);
    expect(mine, "pending payload available").to.not.equal(undefined);
    await connector.appendTxBatch([mine.payload]);

    // Settlement's batch append is idempotent — it skips the already-present row, no duplicate insert.
    const settler = new BlockSettler(store, connector, randomUUID(), blockConfig);
    await settler.settleBlock();
    expect(await outboxStatus(post.txId), "marked sent via the idempotency guard").to.equal("sent");

    // Backstop: a raw duplicate append of the same row WOULD throw — proving idempotency mattered.
    let dupThrew = false;
    try {
      await connector.appendTx(mine.payload);
    } catch {
      dupThrew = true;
    }
    expect(dupThrew, "immudb rejects a duplicate tx_id").to.equal(true);
  });

  it("reconciles a crash after the header but before the mark: no new block, just marks sent", async () => {
    const chainId = randomUUID();
    const settler = new BlockSettler(store, connector, chainId, blockConfig);
    const post = await svc.create({ type: "post", author: "dave", content: { body: "recon" } });
    const header1 = (await settler.settleBlock())!;
    expect(header1.blockHeight).to.equal(1);

    // The header landed, but pretend the outbox mark was lost (crash). Re-settling must NOT make a
    // second block for the same txs — it reconciles them as already-settled and marks them sent.
    await reopenOutbox(post.txId);
    const header2 = await settler.settleBlock();
    expect(header2, "nothing new to block").to.equal(null);
    expect(await outboxStatus(post.txId), "reconciled to sent").to.equal("sent");
    expect((await connector.fetchLatestBlock(chainId))!.blockHeight, "still one block").to.equal(1);
  });

  it("rolls back the private write when the outbox enqueue fails (true atomicity)", async () => {
    const txId = randomUUID();
    const entityId = randomUUID();
    const input = {
      txId,
      type: "post" as const,
      entityId,
      op: "create" as const,
      authorPubkey: "erin",
      signature: "unsigned",
      createdAt: new Date().toISOString(),
      prevHash: null,
      contentHash: "deadbeef",
      txHash: "cafe",
      envelope: "{}",
      salt: "00",
      content: { body: "rollback" },
    };

    // Force the outbox INSERT to fail (payload is NOT NULL) AFTER the record_tx INSERT — the whole
    // transaction must roll back; neither row may survive.
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

  it("retries the batch while immudb is healthy until it lands (retryAttempts)", async () => {
    const ref = await svc.create({ type: "post", author: "frank", content: { body: "retry" } });

    const flaky = new FlakyConnector(connector, 2, [true]); // two failures, then success
    let sleeps = 0;
    const settler = new BlockSettler(store, flaky, randomUUID(), blockConfig, fastRetry, async () => void sleeps++);

    const header = await settler.settleBlock();
    expect(header, "eventually settled").to.not.equal(null);
    expect(flaky.batchCalls, "two failures + one success").to.equal(3);
    expect(sleeps, "no back-off needed while healthy").to.equal(0);
    expect(await outboxStatus(ref.txId)).to.equal("sent");
    expect((await verifyEntityChain(store, connector, ref.entityId)).ok).to.equal(true);
  });

  it("backs off and re-healthchecks while immudb is down, then settles on recovery", async () => {
    const ref = await svc.create({ type: "post", author: "grace", content: { body: "down-then-up" } });

    const flaky = new FlakyConnector(connector, 1, [false, false, true]);
    let sleeps = 0;
    const settler = new BlockSettler(store, flaky, randomUUID(), blockConfig, fastRetry, async () => void sleeps++);

    const header = await settler.settleBlock();
    expect(header).to.not.equal(null);
    expect(sleeps, "waited once per failed healthcheck before recovery").to.equal(2);
    expect(await outboxStatus(ref.txId)).to.equal("sent");
    expect((await verifyEntityChain(store, connector, ref.entityId)).ok).to.equal(true);
  });

  it("gives up after healthcheckAttempts and leaves the pool pending", async () => {
    const ref = await svc.create({ type: "post", author: "heidi", content: { body: "stays down" } });

    const down = new DownConnector();
    let sleeps = 0;
    const settler = new BlockSettler(store, down, randomUUID(), blockConfig, fastRetry, async () => void sleeps++);

    expect(await rejects(settler.settleBlock()), "settle throws when immudb stays down").to.equal(true);
    expect(sleeps, "waited between healthchecks, not after the final one").to.equal(2);
    expect(await outboxStatus(ref.txId), "row remains pending for the next sweep").to.equal("pending");
  });

  it("0 means indefinite: keeps re-healthchecking past the finite limit until recovery", async () => {
    const ref = await svc.create({ type: "post", author: "ivan", content: { body: "indefinite" } });

    // Down for FOUR checks — a finite limit of 3 would give up, but 0 = indefinite must hold on.
    const flaky = new FlakyConnector(connector, 1, [false, false, false, false, true]);
    let sleeps = 0;
    const settler = new BlockSettler(
      store,
      flaky,
      randomUUID(),
      blockConfig,
      { retryAttempts: 0, healthcheckWaitMs: 0, healthcheckAttempts: 0 },
      async () => void sleeps++,
    );

    const header = await settler.settleBlock();
    expect(header, "never gave up despite > 3 down checks").to.not.equal(null);
    expect(flaky.healthCalls, "kept checking until immudb returned").to.equal(5);
    expect(await outboxStatus(ref.txId)).to.equal("sent");
  });
});
