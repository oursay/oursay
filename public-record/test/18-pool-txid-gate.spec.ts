import { randomUUID } from "node:crypto";
import { expect } from "chai";
import pg from "pg";
import { pgConfig } from "../src/config.js";
import { contentCommitment, newSalt } from "../src/crypto/commitment.js";
import type {
  BlockHeader,
  LedgerConnector,
  LedgerRoot,
  RowVerification,
} from "../src/ledger/connector.js";
import { PublicChain } from "../src/ledger/chain.js";
import { LedgerUnavailableError, TxIdAlreadyOnChainError } from "../src/ledger/errors.js";
import type { TxEnvelope } from "../src/schema/types.js";
import { getWorld, rejects, settleAll } from "./helpers/world.js";

/** Wipe a pooled/settled tx from Postgres only (immudb stays). */
async function wipePostgresTx(txId: string): Promise<void> {
  const raw = new pg.Client(pgConfig);
  await raw.connect();
  try {
    await raw.query(`DELETE FROM record_outbox WHERE tx_id = $1`, [txId]);
    await raw.query(`DELETE FROM record_tx WHERE tx_id = $1`, [txId]);
  } finally {
    await raw.end();
  }
}

/** Ledger whose getEnvelope always fails — pool must fail closed. */
class DeadGetEnvelopeLedger implements LedgerConnector {
  readonly transport = "pgwire" as const;
  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  async appendTx(): Promise<void> {
    throw new Error("unused");
  }
  async appendTxBatch(): Promise<void> {
    throw new Error("unused");
  }
  async appendBlock(): Promise<void> {
    throw new Error("unused");
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
    throw new Error("immudb connection refused");
  }
  async state(): Promise<LedgerRoot> {
    throw new Error("unused");
  }
  async verifyRow(): Promise<RowVerification> {
    throw new Error("unused");
  }
}

function unsignedEnvelope(content: unknown): { envelope: TxEnvelope; salt: string; content: unknown } {
  const txId = randomUUID();
  const salt = newSalt();
  const envelope: TxEnvelope = {
    v: 1,
    txId,
    type: "post",
    entityId: randomUUID(),
    op: "create",
    authorPubkey: "alice",
    signature: "unsigned",
    createdAt: new Date().toISOString(),
    prevHash: null,
    contentHash: contentCommitment({ id: txId, salt, content }),
  };
  return { envelope, salt, content };
}

describe("18 pool gate: reject txId already on immudb", () => {
  it("happy path: create → settle still pools and lands on chain", async () => {
    const { svc, connector, store } = await getWorld();
    await store.reset();
    const post = await svc.create({
      type: "post",
      author: "alice",
      content: { title: "Gate happy", body: "ok" },
    });
    await settleAll();
    expect(await connector.getEnvelope(post.txId)).to.be.a("string");
  });

  it("duplicate while still in Postgres: second pool of same txId is rejected", async () => {
    const { chain, store } = await getWorld();
    await store.reset();
    const { envelope, salt, content } = unsignedEnvelope({ title: "dup", body: "a" });
    await chain.append(envelope, { salt, content });
    expect(await rejects(chain.append(envelope, { salt, content }))).to.equal(true);
    expect(await rejects(chain.append(envelope, { salt, content: { title: "dup", body: "b" } }))).to.equal(true);
  });

  it("chain-owned, Postgres gone: reused txId with different content is rejected", async () => {
    const { svc, connector, store, chain } = await getWorld();
    await store.reset();
    const post = await svc.create({
      type: "post",
      author: "alice",
      content: { title: "settled", body: "original" },
    });
    await settleAll();
    const onChain = await connector.getEnvelope(post.txId);
    expect(onChain).to.be.a("string");

    await wipePostgresTx(post.txId);
    expect(await store.getTx(post.txId)).to.equal(undefined);

    // Client resubmits a NEW payload under the OLD chain txId.
    const salt = newSalt();
    const content = { title: "settled", body: "ATTACKER_PAYLOAD" };
    const envelope: TxEnvelope = {
      v: 1,
      txId: post.txId,
      type: "post",
      entityId: post.entityId,
      op: "create",
      authorPubkey: "mallory",
      signature: "unsigned",
      createdAt: new Date().toISOString(),
      prevHash: null,
      contentHash: contentCommitment({ id: post.txId, salt, content }),
    };

    try {
      await chain.append(envelope, { salt, content });
      expect.fail("expected TxIdAlreadyOnChainError");
    } catch (err) {
      expect(err).to.be.instanceOf(TxIdAlreadyOnChainError);
      expect((err as TxIdAlreadyOnChainError).txId).to.equal(post.txId);
    }
    expect(await store.getTx(post.txId)).to.equal(undefined);
    expect(await connector.getEnvelope(post.txId)).to.equal(onChain);
  });

  it("ledger down: append fails closed and does not pool", async () => {
    const { store } = await getWorld();
    await store.reset();
    const dead = new DeadGetEnvelopeLedger();
    const chain = new PublicChain(store, randomUUID(), dead);
    const { envelope, salt, content } = unsignedEnvelope({ title: "down", body: "x" });

    try {
      await chain.append(envelope, { salt, content });
      expect.fail("expected LedgerUnavailableError");
    } catch (err) {
      expect(err).to.be.instanceOf(LedgerUnavailableError);
    }
    expect(await store.getTx(envelope.txId)).to.equal(undefined);
  });
});
