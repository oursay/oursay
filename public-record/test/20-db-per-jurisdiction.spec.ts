/**
 * Per-jurisdiction immudb databases under one LedgerInstance (docs/spikes/immudb/DB-PER-JURISDICTION.md).
 * Proves: distinct roots, isolation on settle/remove, genesis meta, fork lineage.
 */
import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { BundleAssembler } from "../src/anchor/assembler.js";
import { AnchorPublisher } from "../src/anchor/publisher.js";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks } from "../src/anchor/target.js";
import { verifyChain } from "../src/anchor/verify.js";
import { blockConfig, dbNameForChain, ledgerConfig } from "../src/config.js";
import { PublicChain } from "../src/ledger/chain.js";
import { LedgerInstance } from "../src/ledger/instance.js";
import { BlockSettler } from "../src/ledger/settler.js";
import { RecordService } from "../src/record.js";
import { getWorld, isoFromNow } from "./helpers/world.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("20 db-per-jurisdiction", function () {
  this.timeout(120_000);

  it("maps slug chainIds to snake_case database names", () => {
    expect(dbNameForChain("ab-ca-gov")).to.equal("j_ab_ca_gov");
    expect(dbNameForChain("oursay-global")).to.equal("j_oursay_global");
  });

  it("ledgerId is a UUID and is written as genesis meta", async () => {
    expect(ledgerConfig.ledgerId).to.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const w = await getWorld();
    const meta = await w.connector.getMeta("ledger_id");
    expect(meta).to.equal(w.ledger.ledgerId);
    expect(await w.connector.getMeta("chain_id")).to.equal(w.chainId);
  });

  it("two chains have distinct immudb_state roots; settle A does not change B", async () => {
    const w = await getWorld();
    await w.store.reset();

    const chainA = randomUUID();
    const chainB = randomUUID();
    await w.ledger.createDatabaseFor(chainA);
    await w.ledger.createDatabaseFor(chainB);
    w.createdChainIds.push(chainA, chainB);

    const connA = await w.ledger.getConnector(chainA);
    const connB = await w.ledger.getConnector(chainB);
    const stateB0 = await connB.state();

    const svcA = new RecordService(new PublicChain(w.store, chainA, connA), w.store);
    await svcA.create({
      type: "post",
      author: "alice",
      content: { title: "A", body: "chain A only" },
    });
    const settlerA = new BlockSettler(w.store, connA, chainA, blockConfig);
    const headersA = await settlerA.flushPendingSettlement();
    expect(headersA.length).to.be.greaterThan(0);
    expect(headersA[0]!.immudbRoot.db).to.equal(connA.databaseName);

    const stateA = await connA.state();
    const stateB1 = await connB.state();
    expect(stateA.db).to.equal(connA.databaseName);
    expect(stateB1.db).to.equal(connB.databaseName);
    expect(stateA.db).to.not.equal(stateB1.db);
    // B's root must be unchanged (same tx id + hash) after settling A.
    expect(stateB1.txId).to.equal(stateB0.txId);
    expect(stateB1.txHashHex).to.equal(stateB0.txHashHex);
  });

  it("remove chain A leaves chain B settlable and verifiable", async () => {
    const w = await getWorld();
    await w.store.reset();

    const chainA = `rm-a-${randomUUID().slice(0, 8)}`;
    const chainB = `rm-b-${randomUUID().slice(0, 8)}`;
    await w.ledger.createDatabaseFor(chainA);
    await w.ledger.createDatabaseFor(chainB);
    w.createdChainIds.push(chainA, chainB);

    const connA = await w.ledger.getConnector(chainA);
    const connB = await w.ledger.getConnector(chainB);

    const svcB = new RecordService(new PublicChain(w.store, chainB, connB), w.store);
    await svcB.create({
      type: "post",
      author: "bob",
      content: { title: "B", body: "survives remove of A" },
    });

    const dropResult = await w.ledger.dropDatabaseFor(chainA);
    // If DROP is unsupported on this immudb build, skip the rest — still document the path.
    if (dropResult === "unsupported") {
      console.warn("DROP DATABASE unsupported over pg-wire — isolation via separate DBs still holds");
      return;
    }

    // A is gone from the connector cache; B still settles.
    const settlerB = new BlockSettler(w.store, connB, chainB, blockConfig);
    const headers = await settlerB.flushPendingSettlement();
    expect(headers.length).to.be.greaterThan(0);

    const anchorDir = mkdtempSync(join(tmpdir(), "oursay-dbjur-"));
    const target = new FileAnchorTarget(anchorDir, everyNBlocks(1));
    const publisher = new AnchorPublisher(connB, new BundleAssembler(w.store), chainB, w.store);
    await publisher.publish(target);
    const report = verifyChain(await target.listAnchors(), chainB);
    expect(report.ok).to.equal(true);

    // Re-creating A should not resurrect into B's state.
    await w.ledger.createDatabaseFor(chainA);
    const connA2 = await w.ledger.getConnector(chainA);
    expect(connA2.databaseName).to.equal(dbNameForChain(chainA));
    expect(await connA2.fetchLatestBlock(chainA)).to.equal(undefined);
    void connA;
    void isoFromNow;
  });

  it("fork records parent lineage in ledger_meta", async () => {
    const w = await getWorld();
    await w.store.reset();

    const source = `fork-src-${randomUUID().slice(0, 8)}`;
    const child = `fork-dst-${randomUUID().slice(0, 8)}`;
    await w.ledger.createDatabaseFor(source);
    w.createdChainIds.push(source);

    const connSrc = await w.ledger.getConnector(source);
    const svc = new RecordService(new PublicChain(w.store, source, connSrc), w.store);
    await svc.create({
      type: "post",
      author: "carol",
      content: { title: "src", body: "to fork" },
    });
    const settler = new BlockSettler(w.store, connSrc, source, blockConfig);
    const headers = await settler.flushPendingSettlement();
    expect(headers[0]?.blockHeight).to.equal(1);

    await w.ledger.createDatabaseFor(child, {
      parentChainId: source,
      forkHeight: 1,
      forkReason: "test-fork",
    });
    w.createdChainIds.push(child);
    const connChild = await w.ledger.getConnector(child);
    expect(await connChild.getMeta("parent_chain_id")).to.equal(source);
    expect(await connChild.getMeta("fork_height")).to.equal("1");
    expect(await connChild.getMeta("fork_reason")).to.equal("test-fork");
    expect(await connChild.getMeta("ledger_id")).to.equal(w.ledger.ledgerId);
  });
});
