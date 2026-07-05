import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks } from "../src/anchor/target.js";
import type { BlockConfig } from "../src/config.js";
import type { BlockHeader } from "../src/ledger/connector.js";
import type { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import type { PrivateStore } from "../src/private/store.js";
import type { RecordService } from "../src/record.js";
import {
  type ChainDecision,
  type ChainRunner,
  type PublisherLike,
  type SettlerLike,
  type Sleeper,
  SettlementWorker,
} from "../src/worker/settlement-worker.js";
import { freshChainWorld, getWorld } from "./helpers/world.js";

const silent = { log() {}, error() {} };

/** Small thresholds so the count trigger fires within a unit test (any pending settles immediately). */
const workerCfg: BlockConfig = { maxPending: 1, maxPendingAgeMs: 60_000, maxBlockTxs: 5, minTxs: 1 };

describe("16 worker: deadline-aware loop drives settle + anchor across chains", () => {
  // ── Unit: the loop drives the settler/publisher; it does not re-implement settlement ──────────

  describe("tick() (fakes, no DB)", () => {
    // A fake settler that yields `blocks` headers then null, recording how it was called.
    function fakeSettler(blocks: number): SettlerLike & { settleCalls: number; triggerCalls: number } {
      let remaining = blocks;
      return {
        settleCalls: 0,
        triggerCalls: 0,
        async maybeSettleBlock() {
          this.settleCalls++;
          if (remaining <= 0) return null;
          remaining--;
          return { blockHeight: blocks - remaining, txCount: 3 } as BlockHeader;
        },
        async evaluateTrigger() {
          this.triggerCalls++;
          return { shouldSettle: false, reason: null, pendingCount: 0, oldestAgeMs: null };
        },
      };
    }

    function fakePublisher(): PublisherLike & { calls: number } {
      return {
        calls: 0,
        async maybePublish() {
          this.calls++;
          return [1];
        },
      };
    }

    it("drains all eligible blocks, then publishes, then records the trigger state — per chain", async () => {
      const sA = fakeSettler(2);
      const pA = fakePublisher();
      const sB = fakeSettler(0);
      const pB = fakePublisher();
      const runners: ChainRunner[] = [
        { chainId: "chain-a", settler: sA, publisher: pA, target: {} as never, blockConfig: workerCfg },
        { chainId: "chain-b", settler: sB, publisher: pB, target: {} as never, blockConfig: workerCfg },
      ];
      const worker = new SettlementWorker({ runners, maxIdleMs: 60_000, minIntervalMs: 1_000, log: silent });

      const summary = await worker.tick();

      // chain-a drained two blocks (3 calls: two headers + the terminating null), chain-b drained none (1 call).
      expect(sA.settleCalls).to.equal(3);
      expect(sB.settleCalls).to.equal(1);
      expect(summary.settled.filter((s) => s.chainId === "chain-a")).to.have.length(2);
      expect(summary.settled.filter((s) => s.chainId === "chain-b")).to.have.length(0);
      // Both chains were offered to the publisher and produced a scheduling decision.
      expect(pA.calls).to.equal(1);
      expect(pB.calls).to.equal(1);
      expect(summary.decisions.map((d) => d.chainId)).to.deep.equal(["chain-a", "chain-b"]);
    });

    it("a throwing chain is isolated: the other chain still settles and the tick resolves", async () => {
      const bad: SettlerLike = {
        async maybeSettleBlock() {
          throw new Error("immudb unreachable");
        },
        async evaluateTrigger() {
          throw new Error("immudb unreachable");
        },
      };
      const good = fakeSettler(1);
      const runners: ChainRunner[] = [
        { chainId: "bad", settler: bad, publisher: fakePublisher(), target: {} as never, blockConfig: workerCfg },
        { chainId: "good", settler: good, publisher: fakePublisher(), target: {} as never, blockConfig: workerCfg },
      ];
      const worker = new SettlementWorker({ runners, maxIdleMs: 60_000, minIntervalMs: 1_000, log: silent });

      const summary = await worker.tick();
      expect(summary.settled.map((s) => s.chainId)).to.deep.equal(["good"]);
      expect(summary.decisions.map((d) => d.chainId)).to.deep.equal(["bad", "good"]); // both scheduled
    });
  });

  // ── Unit: deadline scheduling, incl. the count-trigger safety net ─────────────────────────────

  describe("computeNextWakeMs()", () => {
    const worker = new SettlementWorker({ runners: [], maxIdleMs: 60_000, minIntervalMs: 1_000, log: silent });
    const dec = (o: Partial<ChainDecision>): ChainDecision => ({
      chainId: "c",
      pendingCount: 0,
      oldestAgeMs: null,
      maxPendingAgeMs: 60_000,
      minTxs: 1,
      ...o,
    });

    it("empty/below-threshold pools wake at maxIdleMs (count-trigger safety net, no LISTEN/NOTIFY)", () => {
      expect(worker.computeNextWakeMs([])).to.equal(60_000);
      expect(worker.computeNextWakeMs([dec({ pendingCount: 0 })])).to.equal(60_000);
      // pending present but below minTxs ⇒ no age deadline ⇒ still the idle floor.
      expect(worker.computeNextWakeMs([dec({ pendingCount: 1, oldestAgeMs: 10_000, minTxs: 5 })])).to.equal(60_000);
    });

    it("picks the nearest age deadline across chains, clamped to [minIntervalMs, maxIdleMs]", () => {
      // remaining = maxPendingAgeMs - oldestAgeMs
      const near = dec({ pendingCount: 2, oldestAgeMs: 50_000, maxPendingAgeMs: 60_000 }); // 10_000 left
      const far = dec({ pendingCount: 2, oldestAgeMs: 5_000, maxPendingAgeMs: 60_000 }); // 55_000 left
      expect(worker.computeNextWakeMs([far, near])).to.equal(10_000);
      // Past the deadline ⇒ clamps UP to minIntervalMs (never busy-loops).
      const overdue = dec({ pendingCount: 2, oldestAgeMs: 90_000, maxPendingAgeMs: 60_000 });
      expect(worker.computeNextWakeMs([overdue])).to.equal(1_000);
    });
  });

  // ── Unit: run()/stop() lifecycle with a controllable sleeper (no wall-clock) ──────────────────

  it("run() loops and stop() ends it after the in-flight tick", async () => {
    let resolveSleep: (() => void) | null = null;
    let sleeps = 0;
    const sleeper: Sleeper = {
      sleep() {
        sleeps++;
        return new Promise<void>((r) => {
          resolveSleep = r;
        });
      },
      wake() {
        resolveSleep?.();
        resolveSleep = null;
      },
    };
    const settler: SettlerLike = {
      async maybeSettleBlock() {
        return null;
      },
      async evaluateTrigger() {
        return { shouldSettle: false, reason: null, pendingCount: 0, oldestAgeMs: null };
      },
    };
    const runner: ChainRunner = {
      chainId: "c",
      settler,
      publisher: { async maybePublish() { return []; } },
      target: {} as never,
      blockConfig: workerCfg,
    };
    const worker = new SettlementWorker({ runners: [runner], maxIdleMs: 60_000, minIntervalMs: 1_000, sleeper, log: silent });

    const done = worker.run();
    // Let the first tick complete and reach the sleep.
    await new Promise((r) => setTimeout(r, 0));
    expect(sleeps, "ran a tick then slept").to.equal(1);

    worker.stop(); // sets stopped + wakes the sleep → loop exits
    await done; // resolves cleanly
  });

  // ── Integration: real settler/publisher over the shared DB; two chains stay isolated ──────────

  describe("tick() over real wiring", () => {
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

    async function makePosts(svc: RecordService, n: number): Promise<void> {
      for (let i = 0; i < n; i++) {
        await svc.create({ type: "post", author: "alice", content: { title: "Test post", body: `c-${i}` } });
      }
    }
    function freshTarget(): { dir: string; target: FileAnchorTarget } {
      const dir = mkdtempSync(join(tmpdir(), "oursay-worker-"));
      return { dir, target: new FileAnchorTarget(dir, everyNBlocks(1)) };
    }

    it("settles + anchors each chain's pooled txs and keeps chains isolated", async () => {
      const a = await freshChainWorld(workerCfg);
      const b = await freshChainWorld(workerCfg);
      await makePosts(a.svc, 3);
      await makePosts(b.svc, 2);

      const ta = freshTarget();
      const tb = freshTarget();
      const runners: ChainRunner[] = [
        { chainId: a.chainId, settler: a.settler, publisher: a.publisher, target: ta.target, blockConfig: workerCfg },
        { chainId: b.chainId, settler: b.settler, publisher: b.publisher, target: tb.target, blockConfig: workerCfg },
      ];
      const worker = new SettlementWorker({ runners, maxIdleMs: 60_000, minIntervalMs: 1_000, log: silent });

      const summary = await worker.tick();

      // Each chain settled exactly its own pooled txs into block 1 (chain isolation).
      const headerA = (await connector.fetchLatestBlock(a.chainId))!;
      const headerB = (await connector.fetchLatestBlock(b.chainId))!;
      expect(headerA.blockHeight).to.equal(1);
      expect(headerA.txCount, "chain A settled its 3 txs, not B's").to.equal(3);
      expect(headerB.blockHeight).to.equal(1);
      expect(headerB.txCount, "chain B settled its 2 txs, not A's").to.equal(2);
      expect(summary.published.map((p) => p.chainId).sort()).to.deep.equal([a.chainId, b.chainId].sort());

      // Anchor artifacts landed for each chain's target.
      for (const t of [ta, tb]) {
        expect(existsSync(join(t.dir, "anchors.jsonl"))).to.equal(true);
        expect(existsSync(join(t.dir, "blocks", "block-00001.json"))).to.equal(true);
      }
    });
  });
});
