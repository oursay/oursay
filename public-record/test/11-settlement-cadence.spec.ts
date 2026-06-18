import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { BundleAssembler } from "../src/anchor/assembler.js";
import { AnchorPublisher } from "../src/anchor/publisher.js";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks } from "../src/anchor/target.js";
import { verifyBlock, verifyChain } from "../src/anchor/verify.js";
import type { BlockConfig } from "../src/config.js";
import { BlockSettler } from "../src/ledger/settler.js";
import type { Ref } from "../src/record.js";
import { getWorld } from "./helpers/world.js";

/** Small thresholds so the count/age triggers and the publish cadence fire within a unit test. */
const cadenceCfg: BlockConfig = {
  maxPending: 5, // N — settle once 5 accumulate
  maxPendingAgeMs: 60_000, // X — or once the oldest has waited 1 minute
  maxBlockTxs: 5, // cap each block at 5 txs
  minTxs: 1, // never settle an empty block
};

describe("11 settlement cadence: count/age triggers + per-target publish cadence", () => {
  let svc: Awaited<ReturnType<typeof getWorld>>["svc"];
  let store: Awaited<ReturnType<typeof getWorld>>["store"];
  let connector: Awaited<ReturnType<typeof getWorld>>["connector"];

  before(async () => {
    const w = await getWorld();
    svc = w.svc;
    store = w.store;
    connector = w.connector;
  });

  beforeEach(async () => {
    await store.reset();
  });

  function freshChain() {
    const chainId = randomUUID();
    const settler = new BlockSettler(store, connector, chainId, cadenceCfg);
    const publisher = new AnchorPublisher(connector, new BundleAssembler(store), chainId);
    return { chainId, settler, publisher };
  }

  function freshTarget() {
    const dir = mkdtempSync(join(tmpdir(), "oursay-cadence-"));
    return { dir, target: new FileAnchorTarget(dir, everyNBlocks(2)) };
  }

  async function makePosts(n: number): Promise<Ref[]> {
    const refs: Ref[] = [];
    for (let i = 0; i < n; i++) {
      refs.push(await svc.create({ type: "post", author: "alice", content: { body: `c-${i}-${randomUUID()}` } }));
    }
    return refs;
  }

  it("count trigger: holds below N, then settles, capping the block at maxBlockTxs", async () => {
    const { chainId, settler } = freshChain();
    const now = Date.now();

    await makePosts(2);
    expect((await settler.evaluateTrigger(now)).shouldSettle, "2 < 5, not yet").to.equal(false);
    expect(await settler.maybeSettleBlock({ now }), "no block while below N").to.equal(null);

    // Push to 6 pending: the count trigger fires and the block is capped at 5, leaving 1 pending.
    const refs = await makePosts(4);
    const decision = await settler.evaluateTrigger(now);
    expect(decision.shouldSettle).to.equal(true);
    expect(decision.reason).to.equal("count");

    const header = (await settler.maybeSettleBlock({ now }))!;
    expect(header.blockHeight).to.equal(1);
    expect(header.txCount, "capped at maxBlockTxs").to.equal(5);

    expect((await store.getPendingPoolStats()).count, "one tx left for the next block").to.equal(1);
    expect((await connector.fetchLatestBlock(chainId))!.blockHeight).to.equal(1);
    // The block takes the 5 LOWEST-seq txs; the last-created one is beyond the cap → still pending.
    expect(await connector.getEnvelope(refs[2].txId), "a settled tx is on the chain").to.not.equal(undefined);
    expect(await connector.getEnvelope(refs[3].txId), "the capped-out tx is NOT yet on the chain").to.equal(undefined);
  });

  it("age trigger: a lone old pending tx settles even below the count threshold", async () => {
    const { settler } = freshChain();
    const realNow = Date.now();

    await makePosts(1);
    expect((await settler.evaluateTrigger(realNow)).shouldSettle, "fresh & below N").to.equal(false);

    // Advance the clock past the age threshold (the oldest pending tx has now "waited" > 1 min).
    const later = realNow + 61_000;
    const decision = await settler.evaluateTrigger(later);
    expect(decision.shouldSettle).to.equal(true);
    expect(decision.reason).to.equal("age");

    const header = (await settler.maybeSettleBlock({ now: later }))!;
    expect(header.txCount).to.equal(1);
    expect((await store.getPendingPoolStats()).count, "pool drained").to.equal(0);
  });

  it("publish cadence: the file target publishes every 2 settled blocks, in order, and verifies", async () => {
    const { settler, publisher } = freshChain();
    const { dir, target } = freshTarget(); // everyNBlocks(2)

    // Settle block 1 (force-settle; the trigger itself is covered above), then try to publish.
    await makePosts(2);
    await settler.settleBlock({ capturedAt: "2026-06-16T00:00:00.000Z" });
    expect(await publisher.maybePublish(target), "only 1 block — below the every-2 cadence").to.deep.equal([]);

    // Settle block 2 → the cadence is met, so BOTH blocks publish, in order.
    await makePosts(3);
    await settler.settleBlock({ capturedAt: "2026-06-16T00:00:00.000Z" });
    expect(await publisher.maybePublish(target)).to.deep.equal([1, 2]);

    const lines = readFileSync(join(dir, "anchors.jsonl"), "utf8").split("\n").filter((l) => l.trim());
    expect(lines.length, "two anchors on disk").to.equal(2);

    // Offline auditor: verify each block against its independently-fetched root, then the whole chain.
    const anchor1 = (await target.fetchAnchor(1))!;
    const anchor2 = (await target.fetchAnchor(2))!;
    expect(verifyBlock((await target.fetchBundle(1))!, anchor1.bundleMerkleRoot).ok).to.equal(true);
    expect(verifyBlock((await target.fetchBundle(2))!, anchor2.bundleMerkleRoot).ok).to.equal(true);
    expect(verifyChain([anchor1, anchor2]).ok, "chain intact end to end").to.equal(true);
  });

  it("re-evaluating with no new pending settles nothing (idempotent tick)", async () => {
    const { settler } = freshChain();
    const now = Date.now();
    await makePosts(5);
    expect(await settler.maybeSettleBlock({ now }), "first tick settles").to.not.equal(null);
    expect(await settler.maybeSettleBlock({ now: now + 120_000 }), "second tick is a no-op").to.equal(null);
    expect((await store.getPendingPoolStats()).count).to.equal(0);
  });
});
