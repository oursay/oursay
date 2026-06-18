import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks } from "../src/anchor/target.js";
import {
  computeChainTipHash,
  verifyBlock,
  verifyChain,
  verifyChainLink,
  verifyEntry,
} from "../src/anchor/verify.js";
import { canonicalJson, sha256Hex } from "../src/crypto/commitment.js";
import { hashLeaf, merkleRoot } from "../src/crypto/merkle.js";
import type { PrivateStore } from "../src/private/store.js";
import type { RecordService } from "../src/record.js";
import { type ChainWorld, freshChainWorld, getWorld, rejects } from "./helpers/world.js";

const T = "2026-06-16T00:00:00.000Z"; // injected capturedAt for deterministic chain-link asserts

describe("09 anchoring: settle to the chain, publish to a target, verify offline", () => {
  let store: PrivateStore;

  before(async () => {
    const w = await getWorld();
    store = w.store;
  });

  beforeEach(async () => {
    await store.reset(); // clean the pool so each test settles a known range
  });

  /** A fresh genesis per test: new chainId ⇒ heights start at 1 (immudb is never reset); the bound
   *  svc pools to that chainId so the settler drains it. `publish` here force-publishes every block. */
  async function chain(): Promise<ChainWorld> {
    return freshChainWorld();
  }

  function freshTarget() {
    const dir = mkdtempSync(join(tmpdir(), "oursay-anchor-"));
    return { dir, target: new FileAnchorTarget(dir, everyNBlocks(1)) };
  }

  async function makePosts(svc: RecordService, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await svc.create({ type: "post", author: "alice", content: { body: `post-${i}` } });
    }
  }

  it("settles a block over a known range; metadata is reproducible across targets, artifacts land", async () => {
    const { chainId, svc, settler, publisher } = await chain();
    await makePosts(svc, 3);
    const header = (await settler.settleBlock({ capturedAt: T }))!;
    expect(header.blockHeight).to.equal(1);
    expect(header.fromSeq).to.equal(0);
    expect(header.txCount).to.equal(3);
    expect(header.chainId).to.equal(chainId);

    // The settled block replicates to TWO independent targets → identical bundles (reproducible).
    const a = freshTarget();
    const b = freshTarget();
    expect(await publisher.publish(a.target)).to.deep.equal([1]);
    expect(await publisher.publish(b.target)).to.deep.equal([1]);

    expect(existsSync(join(a.dir, "anchors.jsonl"))).to.equal(true);
    expect(existsSync(join(a.dir, "blocks", "block-00001.json"))).to.equal(true);

    const blockA = (await a.target.fetchBundle(1))!;
    const blockB = (await b.target.fetchBundle(1))!;
    expect(blockA.anchor.chainId).to.equal(chainId);
    expect(blockA.anchor.blockHeight).to.equal(1);
    expect(blockA.anchor.fromSeq).to.equal(0);
    expect(blockA.anchor.txCount).to.equal(3);
    expect(blockB.anchor.bundleMerkleRoot).to.equal(blockA.anchor.bundleMerkleRoot);
    expect(blockB.anchor.chainTipHash).to.equal(blockA.anchor.chainTipHash);
    expect(blockB.entries.map((e) => e.leafHash)).to.deep.equal(blockA.entries.map((e) => e.leafHash));
  });

  it("bundleMerkleRoot equals an independent Merkle over the envelopes in seq order", async () => {
    const { svc, settler, publisher } = await chain();
    await makePosts(svc, 4);
    await settler.settleBlock();
    const { target } = freshTarget();
    await publisher.publish(target);

    const block = (await target.fetchBundle(1))!;
    const independentRoot = merkleRoot(block.entries.map((e) => hashLeaf(e.envelope)));
    expect(block.anchor.bundleMerkleRoot).to.equal(independentRoot);
    const seqs = block.entries.map((e) => e.seq);
    expect(seqs).to.deep.equal([...seqs].sort((x, y) => x - y));
  });

  it("the genesis chain-tip folds null with the block hash; proposer/attestations reserved empty", async () => {
    const { svc, settler, publisher } = await chain();
    await makePosts(svc, 2);
    const header = (await settler.settleBlock())!;
    expect(header.prevChainTipHash).to.equal(null);
    expect(header.chainTipHash).to.equal(computeChainTipHash(null, header.bundleMerkleRoot));
    expect(header.proposer).to.equal(null);
    expect(header.attestations).to.deep.equal([]);

    const { target } = freshTarget();
    await publisher.publish(target);
    const anchor = (await target.fetchAnchor(1))!;
    expect(anchor.chainTipHash).to.equal(computeChainTipHash(null, anchor.bundleMerkleRoot));
    expect(anchor.proposer).to.equal(null);
    expect(anchor.attestations).to.deep.equal([]);
  });

  it("captures immudbRoot AFTER the batch append", async () => {
    const { svc, settler } = await chain();
    await makePosts(svc, 2);
    const header = (await settler.settleBlock())!;
    expect(header.immudbRoot.txId).to.be.greaterThan(0);
    expect(header.immudbRoot.txHashHex).to.match(/^[0-9a-f]{64}$/);
  });

  it("is append-only: publishing block 2 does not rewrite block 1's artifacts", async () => {
    const { svc, settler, publisher } = await chain();
    const { dir, target } = freshTarget();
    await makePosts(svc, 2);
    await settler.settleBlock({ capturedAt: T });
    await publisher.publish(target);

    const block1File = readFileSync(join(dir, "blocks", "block-00001.json"), "utf8");
    const firstLine = readFileSync(join(dir, "anchors.jsonl"), "utf8").split("\n")[0];

    await makePosts(svc, 2);
    await settler.settleBlock({ capturedAt: T });
    await publisher.publish(target);

    expect(readFileSync(join(dir, "blocks", "block-00001.json"), "utf8")).to.equal(block1File);
    expect(readFileSync(join(dir, "anchors.jsonl"), "utf8").split("\n")[0]).to.equal(firstLine);
    expect(existsSync(join(dir, "blocks", "block-00002.json"))).to.equal(true);
  });

  it("verifies a full block offline using a root fetched independently from the target", async () => {
    const { svc, settler, publisher } = await chain();
    await makePosts(svc, 3);
    await settler.settleBlock();
    const { target } = freshTarget();
    await publisher.publish(target);

    // Auditor: fetch the anchor (independent root source) + bundle from the target. No DB.
    const anchor = (await target.fetchAnchor(1))!;
    const bundle = (await target.fetchBundle(1))!;
    const report = verifyBlock(bundle, anchor.bundleMerkleRoot);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
    expect(report.rootMatches && report.txCountOk).to.equal(true);
  });

  it("verifies a single entry with only its proof + the block's anchored root", async () => {
    const { svc, settler, publisher } = await chain();
    const { target } = freshTarget();
    await makePosts(svc, 2);
    await settler.settleBlock({ capturedAt: T }); // block 1
    await makePosts(svc, 2);
    await settler.settleBlock({ capturedAt: T }); // block 2
    await publisher.publish(target);

    const anchor2 = (await target.fetchAnchor(2))!;
    const bundle2 = (await target.fetchBundle(2))!;
    const entry = bundle2.entries[0];
    const verdict = verifyEntry(entry, anchor2, anchor2.bundleMerkleRoot);
    expect(verdict.ok, JSON.stringify(verdict)).to.equal(true);
  });

  it("chains block 2 onto block 1; verifyChainLink + verifyChain pass on the published anchors", async () => {
    const { chainId, svc, settler, publisher } = await chain();
    const { target } = freshTarget();
    await makePosts(svc, 2);
    await settler.settleBlock({ capturedAt: T });
    await makePosts(svc, 3);
    await settler.settleBlock({ capturedAt: T });
    await publisher.publish(target);

    const anchor1 = (await target.fetchAnchor(1))!;
    const anchor2 = (await target.fetchAnchor(2))!;

    expect(anchor2.prevBlockRoot).to.equal(anchor1.bundleMerkleRoot);
    expect(anchor2.fromSeq).to.equal(anchor1.toSeq);
    expect(anchor2.prevChainTipHash).to.equal(anchor1.chainTipHash);
    expect(anchor2.chainTipHash).to.equal(computeChainTipHash(anchor1.chainTipHash, anchor2.bundleMerkleRoot));
    expect(anchor2.prevAnchorHash).to.equal(sha256Hex(canonicalJson(anchor1)));
    expect(verifyChainLink(anchor2, anchor1)).to.equal(true);

    // The whole-chain walker confirms the tip end to end — and binds it to the expected chainId.
    const chk = verifyChain([anchor1, anchor2], chainId);
    expect(chk.ok).to.equal(true);
    expect(chk.tipHash).to.equal(anchor2.chainTipHash);
    // A wrong expected chainId is rejected even though the chain itself is intact.
    expect(verifyChain([anchor1, anchor2], "some-other-chain").ok).to.equal(false);
  });

  it("withholds reveals for redacted/erased entries (store retains raw); reveals recompute", async () => {
    const { svc, settler, publisher } = await chain();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "visible" } });
    const redacted = await svc.create({ type: "comment", author: "bob", content: { body: "hateful content" }, parent: { type: "post", id: post.entityId } });
    const erased = await svc.create({ type: "comment", author: "bob", content: { body: "gone soon" }, parent: { type: "post", id: post.entityId } });

    await settler.settleBlock(); // commitments settled over the intact envelopes
    await store.redact(redacted.txId); // redaction/erasure happen AFTER settlement, BEFORE publish
    await store.erase(erased.txId);

    const { target } = freshTarget();
    await publisher.publish(target);
    const block = (await target.fetchBundle(1))!;

    const e = (id: string) => block.entries.find((x) => x.txId === id)!;
    expect(e(redacted.txId).reveal, "redacted omits reveal").to.equal(undefined);
    expect(e(erased.txId).reveal, "erased omits reveal").to.equal(undefined);
    expect(e(post.txId).reveal, "visible post is revealed").to.not.equal(undefined);

    const internal = await store.getEntityState(redacted.entityId);
    expect((internal!.content as { body: string }).body).to.equal("hateful content");
    expect(JSON.stringify(block)).to.not.include("hateful content");

    const report = verifyBlock(block, block.anchor.bundleMerkleRoot);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
    expect(report.verdicts.find((v) => v.txId === redacted.txId)!.status).to.equal("withheld");
    expect(report.verdicts.find((v) => v.txId === post.txId)!.status).to.equal("revealed");
  });

  it("rejects an entry whose seq falls outside the anchor range", async () => {
    const { svc, settler, publisher } = await chain();
    await makePosts(svc, 2);
    await settler.settleBlock();
    const { target } = freshTarget();
    await publisher.publish(target);

    const block = (await target.fetchBundle(1))!;
    const entry = block.entries[0];
    const badAnchor = { ...block.anchor, fromSeq: entry.seq, toSeq: entry.seq + 5 }; // seq == fromSeq → out
    const verdict = verifyEntry(entry, badAnchor, block.anchor.bundleMerkleRoot);
    expect(verdict.ok).to.equal(false);
  });

  it("fails loudly on a corrupt target (missing block file or a height gap)", async () => {
    const { svc, settler, publisher } = await chain();
    await makePosts(svc, 2);
    await settler.settleBlock();

    // (a) missing block file
    const { dir, target } = freshTarget();
    await publisher.publish(target);
    rmSync(join(dir, "blocks", "block-00001.json"));
    expect(await rejects(target.listAnchors()), "missing block file").to.equal(true);

    // (b) height gap in anchors.jsonl
    const { dir: dir2, target: target2 } = freshTarget();
    await publisher.publish(target2); // block 1
    const gapLine = canonicalJson({ ...(await new FileAnchorTarget(dir2).fetchAnchor(1))!, blockHeight: 3 });
    writeFileSync(join(dir2, "anchors.jsonl"), readFileSync(join(dir2, "anchors.jsonl"), "utf8") + gapLine + "\n");
    expect(await rejects(target2.listAnchors()), "height gap").to.equal(true);
  });

  it("detects tampering: altered envelope, altered reveal, and wrong anchored root", async () => {
    const { svc, settler, publisher } = await chain();
    await makePosts(svc, 3);
    await settler.settleBlock();
    const { target } = freshTarget();
    await publisher.publish(target);
    const block = (await target.fetchBundle(1))!;
    const root = block.anchor.bundleMerkleRoot;

    const tampered1 = structuredClone(block);
    tampered1.entries[0].envelope = tampered1.entries[0].envelope.replace('"alice"', '"mallory"');
    expect(tampered1.entries[0].envelope, "tamper actually changed the envelope").to.not.equal(block.entries[0].envelope);
    expect(verifyBlock(tampered1, root).ok).to.equal(false);

    const tampered2 = structuredClone(block);
    const revealed = tampered2.entries.find((e) => e.reveal)!;
    revealed.reveal!.content = { body: "forged" };
    expect(verifyEntry(revealed, tampered2.anchor, root).ok).to.equal(false);

    expect(verifyBlock(block, "0".repeat(64)).ok).to.equal(false);
  });

  it("settleBlock returns null when the pool is empty", async () => {
    const { settler } = await chain();
    expect(await settler.settleBlock()).to.equal(null);
  });

  it("rejects a bundle file whose embedded anchor diverges from anchors.jsonl", async () => {
    const { svc, settler, publisher } = await chain();
    await makePosts(svc, 2);
    await settler.settleBlock();
    const { dir, target } = freshTarget();
    await publisher.publish(target);

    const blockPath = join(dir, "blocks", "block-00001.json");
    const bundle = JSON.parse(readFileSync(blockPath, "utf8"));
    bundle.anchor.bundleMerkleRoot = "0".repeat(64);
    writeFileSync(blockPath, JSON.stringify(bundle));

    expect(await rejects(target.fetchBundle(1))).to.equal(true);
  });
});
