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
});
