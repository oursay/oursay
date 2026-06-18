import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks } from "../src/anchor/target.js";
import { verifyBlock, verifyChain } from "../src/anchor/verify.js";
import type { BlockConfig } from "../src/config.js";
import type { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import type { PrivateStore } from "../src/private/store.js";
import type { RecordService } from "../src/record.js";
import { freshChainWorld, getWorld } from "./helpers/world.js";

/** Small thresholds so the count/age triggers and the publish cadence fire within a unit test. */
const cadenceCfg: BlockConfig = {
  maxPending: 5, // N — settle once 5 accumulate
  maxPendingAgeMs: 60_000, // X — or once the oldest has waited 1 minute
  maxBlockTxs: 5, // cap each block at 5 txs
  minTxs: 1, // never settle an empty block
};

describe("11 settlement cadence: count/age triggers, per-target publish cadence, chain isolation", () => {
  let store: PrivateStore;
  let connector: PgWireLedgerConnector;

  before(async () => {
    const w = await getWorld();
    store = w.store;
    connector = w.connector;
  });

  beforeEach(async () => {
    await store.reset();
  });

  function freshTarget() {
    const dir = mkdtempSync(join(tmpdir(), "oursay-cadence-"));
    return { dir, target: new FileAnchorTarget(dir, everyNBlocks(2)) };
  }

  async function makePosts(svc: RecordService, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await svc.create({ type: "post", author: "alice", content: { body: `c-${i}` } });
    }
  }

  it("count trigger: holds below N, then settles, capping the block at maxBlockTxs", async () => {
    const { chainId, svc, settler } = await freshChainWorld(cadenceCfg);
    const now = Date.now();

    await makePosts(svc, 2);
    expect((await settler.evaluateTrigger(now)).shouldSettle, "2 < 5, not yet").to.equal(false);
    expect(await settler.maybeSettleBlock({ now }), "no block while below N").to.equal(null);

    // Push to 6 pending: the count trigger fires and the block is capped at 5, leaving 1 pending.
    await makePosts(svc, 4);
    const decision = await settler.evaluateTrigger(now);
    expect(decision.shouldSettle).to.equal(true);
    expect(decision.reason).to.equal("count");

    const header = (await settler.maybeSettleBlock({ now }))!;
    expect(header.blockHeight).to.equal(1);
    expect(header.txCount, "capped at maxBlockTxs").to.equal(5);

    expect((await store.getPendingPoolStats(chainId)).count, "one tx left for the next block").to.equal(1);
    expect((await connector.fetchLatestBlock(chainId))!.blockHeight).to.equal(1);
  });

  it("age trigger: a lone old pending tx settles even below the count threshold", async () => {
    const { chainId, svc, settler } = await freshChainWorld(cadenceCfg);
    const realNow = Date.now();

    await makePosts(svc, 1);
    expect((await settler.evaluateTrigger(realNow)).shouldSettle, "fresh & below N").to.equal(false);

    // Advance the clock past the age threshold (the oldest pending tx has now "waited" > 1 min).
    const later = realNow + 61_000;
    const decision = await settler.evaluateTrigger(later);
    expect(decision.shouldSettle).to.equal(true);
    expect(decision.reason).to.equal("age");

    const header = (await settler.maybeSettleBlock({ now: later }))!;
    expect(header.txCount).to.equal(1);
    expect((await store.getPendingPoolStats(chainId)).count, "pool drained").to.equal(0);
  });

  it("publish cadence: the file target publishes every 2 settled blocks, in order, and verifies", async () => {
    const { chainId, svc, settler, publisher } = await freshChainWorld(cadenceCfg);
    const { dir, target } = freshTarget(); // everyNBlocks(2)

    // Settle block 1 (force-settle; the trigger itself is covered above), then try to publish.
    await makePosts(svc, 2);
    await settler.settleBlock({ capturedAt: "2026-06-16T00:00:00.000Z" });
    expect(await publisher.maybePublish(target), "only 1 block — below the every-2 cadence").to.deep.equal([]);

    // Settle block 2 → the cadence is met, so BOTH blocks publish, in order.
    await makePosts(svc, 3);
    await settler.settleBlock({ capturedAt: "2026-06-16T00:00:00.000Z" });
    expect(await publisher.maybePublish(target)).to.deep.equal([1, 2]);

    const lines = readFileSync(join(dir, "anchors.jsonl"), "utf8").split("\n").filter((l) => l.trim());
    expect(lines.length, "two anchors on disk").to.equal(2);

    // Offline auditor: verify each block against its independently-fetched root, then the whole chain.
    const anchor1 = (await target.fetchAnchor(1))!;
    const anchor2 = (await target.fetchAnchor(2))!;
    expect(verifyBlock((await target.fetchBundle(1))!, anchor1.bundleMerkleRoot).ok).to.equal(true);
    expect(verifyBlock((await target.fetchBundle(2))!, anchor2.bundleMerkleRoot).ok).to.equal(true);
    expect(verifyChain([anchor1, anchor2], chainId).ok, "chain intact end to end").to.equal(true);
  });

  it("re-evaluating with no new pending settles nothing (idempotent tick)", async () => {
    const { chainId, svc, settler } = await freshChainWorld(cadenceCfg);
    const now = Date.now();
    await makePosts(svc, 5);
    expect(await settler.maybeSettleBlock({ now }), "first tick settles").to.not.equal(null);
    expect(await settler.maybeSettleBlock({ now: now + 120_000 }), "second tick is a no-op").to.equal(null);
    expect((await store.getPendingPoolStats(chainId)).count).to.equal(0);
  });

  it("chain isolation: two chains share one pool+immudb; a settler drains only its own chain", async () => {
    const a = await freshChainWorld(cadenceCfg);
    const b = await freshChainWorld(cadenceCfg);

    const aPosts = await Promise.all([0, 1, 2].map(() => a.svc.create({ type: "post", author: "alice", content: { body: "a" } })));
    const bPosts = await Promise.all([0, 1].map(() => b.svc.create({ type: "post", author: "bob", content: { body: "b" } })));

    // Settle chain A only.
    const aHeaders = await a.settler.flushPendingSettlement();
    expect(aHeaders.length).to.equal(1);
    expect(aHeaders[0].txCount, "only chain A's 3 txs").to.equal(3);

    // Chain B's pool is untouched; chain A's is drained.
    expect((await store.getPendingPoolStats(a.chainId)).count, "A drained").to.equal(0);
    expect((await store.getPendingPoolStats(b.chainId)).count, "B intact — not swept by A's settler").to.equal(2);

    // Now settle chain B; each chain starts at height 1 and holds only its own txs.
    const bHeaders = await b.settler.flushPendingSettlement();
    expect(bHeaders.length).to.equal(1);
    expect(bHeaders[0].txCount).to.equal(2);
    expect((await connector.fetchLatestBlock(a.chainId))!.blockHeight).to.equal(1);
    expect((await connector.fetchLatestBlock(b.chainId))!.blockHeight).to.equal(1);
    for (const p of aPosts) expect(await connector.getEnvelope(p.txId)).to.not.equal(undefined);
    for (const p of bPosts) expect(await connector.getEnvelope(p.txId)).to.not.equal(undefined);
  });
});
