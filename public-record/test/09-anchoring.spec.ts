import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { BlockBuilder } from "../src/anchor/block.js";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { verifyBlock, verifyChainLink, verifyEntry } from "../src/anchor/verify.js";
import { canonicalJson, sha256Hex } from "../src/crypto/commitment.js";
import { hashLeaf, merkleRoot } from "../src/crypto/merkle.js";
import type { PrivateStore } from "../src/private/store.js";
import type { RecordService } from "../src/record.js";
import { getWorld, rejects } from "./helpers/world.js";

const T = "2026-06-16T00:00:00.000Z"; // injected capturedAt for deterministic chain-link asserts

describe("09 anchoring: incremental blocks, file target, offline verification", () => {
  let svc: RecordService;
  let store: PrivateStore;
  let builder: BlockBuilder;

  before(async () => {
    const w = await getWorld();
    svc = w.svc;
    store = w.store;
    builder = new BlockBuilder(w.store, w.connector);
  });

  beforeEach(async () => {
    await store.reset(); // clean record_tx so each test closes over a known range
  });

  function freshTarget(): { dir: string; target: FileAnchorTarget } {
    const dir = mkdtempSync(join(tmpdir(), "oursay-anchor-"));
    return { dir, target: new FileAnchorTarget(dir) };
  }

  async function makePosts(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await svc.create({ type: "post", author: "alice", content: { body: `post-${i}` } });
    }
  }

  it("closes a block over a known range; metadata is reproducible and artifacts land on disk", async () => {
    await makePosts(3);
    const a = freshTarget();
    const blockA = (await builder.closeBlock(a.target, { capturedAt: T }))!;

    expect(blockA.anchor.blockHeight).to.equal(1);
    expect(blockA.anchor.fromSeq).to.equal(0);
    expect(blockA.anchor.txCount).to.equal(3);
    expect(existsSync(join(a.dir, "anchors.jsonl"))).to.equal(true);
    expect(existsSync(join(a.dir, "blocks", "block-00001.json"))).to.equal(true);

    // Same committed range closed again to a fresh target → identical roots (reproducible).
    const b = freshTarget();
    const blockB = (await builder.closeBlock(b.target, { capturedAt: T }))!;
    expect(blockB.anchor.bundleMerkleRoot).to.equal(blockA.anchor.bundleMerkleRoot);
    expect(blockB.entries.map((e) => e.leafHash)).to.deep.equal(blockA.entries.map((e) => e.leafHash));
  });

  it("bundleMerkleRoot equals an independent Merkle over the envelopes in seq order", async () => {
    await makePosts(4);
    const { target } = freshTarget();
    const block = (await builder.closeBlock(target))!;
    const independentRoot = merkleRoot(block.entries.map((e) => hashLeaf(e.envelope)));
    expect(block.anchor.bundleMerkleRoot).to.equal(independentRoot);
    // entries are in ascending seq order
    const seqs = block.entries.map((e) => e.seq);
    expect(seqs).to.deep.equal([...seqs].sort((x, y) => x - y));
  });

  it("captures immudbRoot at close", async () => {
    await makePosts(2);
    const { target } = freshTarget();
    const block = (await builder.closeBlock(target))!;
    expect(block.anchor.immudbRoot.txId).to.be.greaterThan(0);
    expect(block.anchor.immudbRoot.txHashHex).to.match(/^[0-9a-f]{64}$/);
  });

  it("is append-only: publishing block 2 does not rewrite block 1's artifacts", async () => {
    await makePosts(2);
    const { dir, target } = freshTarget();
    await builder.closeBlock(target, { capturedAt: T });

    const block1File = readFileSync(join(dir, "blocks", "block-00001.json"), "utf8");
    const firstLine = readFileSync(join(dir, "anchors.jsonl"), "utf8").split("\n")[0];

    await makePosts(2);
    await builder.closeBlock(target, { capturedAt: T });

    expect(readFileSync(join(dir, "blocks", "block-00001.json"), "utf8")).to.equal(block1File);
    expect(readFileSync(join(dir, "anchors.jsonl"), "utf8").split("\n")[0]).to.equal(firstLine);
    expect(existsSync(join(dir, "blocks", "block-00002.json"))).to.equal(true);
  });

  it("verifies a full block offline using a root fetched independently from the target", async () => {
    await makePosts(3);
    const { target } = freshTarget();
    await builder.closeBlock(target);

    // Auditor: fetch the anchor (independent root source) + bundle from the target. No DB.
    const anchor = (await target.fetchAnchor(1))!;
    const bundle = (await target.fetchBundle(1))!;
    const report = verifyBlock(bundle, anchor.bundleMerkleRoot);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
    expect(report.rootMatches && report.txCountOk).to.equal(true);
  });

  it("verifies a single entry with only its proof + the block's anchored root", async () => {
    await makePosts(2);
    const { target } = freshTarget();
    await builder.closeBlock(target, { capturedAt: T }); // block 1
    await makePosts(2);
    await builder.closeBlock(target, { capturedAt: T }); // block 2

    const anchor2 = (await target.fetchAnchor(2))!;
    const bundle2 = (await target.fetchBundle(2))!;
    const entry = bundle2.entries[0];
    // One entry, block-2 root only — no block-1 entries loaded.
    const verdict = verifyEntry(entry, anchor2, anchor2.bundleMerkleRoot);
    expect(verdict.ok, JSON.stringify(verdict)).to.equal(true);
  });

  it("chains block 2 onto block 1; an auditor trusting block 1 validates block 2's metadata", async () => {
    await makePosts(2);
    const { target } = freshTarget();
    await builder.closeBlock(target, { capturedAt: T });
    await makePosts(3);
    await builder.closeBlock(target, { capturedAt: T });

    const anchor1 = (await target.fetchAnchor(1))!;
    const anchor2 = (await target.fetchAnchor(2))!;

    expect(anchor2.prevBlockRoot).to.equal(anchor1.bundleMerkleRoot);
    expect(anchor2.fromSeq).to.equal(anchor1.toSeq);
    expect(anchor2.prevAnchorHash).to.equal(sha256Hex(canonicalJson(anchor1)));
    // Validates using anchor1 alone — block-1 entries are never re-merkled.
    expect(verifyChainLink(anchor2, anchor1)).to.equal(true);
  });

  it("withholds reveals for redacted/erased entries (store retains raw); reveals recompute", async () => {
    const post = await svc.create({ type: "post", author: "alice", content: { body: "visible" } });
    const redacted = await svc.create({ type: "comment", author: "bob", content: { body: "hateful content" }, parent: { type: "post", id: post.entityId } });
    const erased = await svc.create({ type: "comment", author: "bob", content: { body: "gone soon" }, parent: { type: "post", id: post.entityId } });
    await store.redact(redacted.txId);
    await store.erase(erased.txId);

    const { target } = freshTarget();
    const block = (await builder.closeBlock(target))!;

    const e = (id: string) => block.entries.find((x) => x.txId === id)!;
    expect(e(redacted.txId).reveal, "redacted omits reveal").to.equal(undefined);
    expect(e(erased.txId).reveal, "erased omits reveal").to.equal(undefined);
    expect(e(post.txId).reveal, "visible post is revealed").to.not.equal(undefined);

    // The redacted plaintext is RETAINED internally but never published.
    const internal = await store.getEntityState(redacted.entityId);
    expect((internal!.content as { body: string }).body).to.equal("hateful content");
    expect(JSON.stringify(block)).to.not.include("hateful content");

    // Offline verification passes: revealed recompute, withheld verify hash-only.
    const report = verifyBlock(block, block.anchor.bundleMerkleRoot);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
    expect(report.verdicts.find((v) => v.txId === redacted.txId)!.status).to.equal("withheld");
    expect(report.verdicts.find((v) => v.txId === post.txId)!.status).to.equal("revealed");
  });

  it("rejects an entry whose seq falls outside the anchor range", async () => {
    await makePosts(2);
    const { target } = freshTarget();
    const block = (await builder.closeBlock(target))!;
    const entry = block.entries[0];
    const badAnchor = { ...block.anchor, fromSeq: entry.seq, toSeq: entry.seq + 5 }; // seq == fromSeq → out
    const verdict = verifyEntry(entry, badAnchor, block.anchor.bundleMerkleRoot);
    expect(verdict.ok).to.equal(false);
  });

  it("fails loudly on a corrupt target (missing block file or a height gap)", async () => {
    await makePosts(2);
    const { dir, target } = freshTarget();
    await builder.closeBlock(target);

    // (a) missing block file
    rmSync(join(dir, "blocks", "block-00001.json"));
    expect(await rejects(target.listAnchors()), "missing block file").to.equal(true);

    // (b) height gap in anchors.jsonl
    const { dir: dir2, target: target2 } = freshTarget();
    await makePosts(0);
    await builder.closeBlock(target2); // block 1
    const gapLine = canonicalJson({ ...(await new FileAnchorTarget(dir2).fetchAnchor(1))!, blockHeight: 3 });
    writeFileSync(join(dir2, "anchors.jsonl"), readFileSync(join(dir2, "anchors.jsonl"), "utf8") + gapLine + "\n");
    expect(await rejects(target2.listAnchors()), "height gap").to.equal(true);
  });

  it("detects tampering: altered envelope, altered reveal, and wrong anchored root", async () => {
    await makePosts(3);
    const { target } = freshTarget();
    const block = (await builder.closeBlock(target))!;
    const root = block.anchor.bundleMerkleRoot;

    // altered envelope (the envelope holds metadata + the commitment, not the plaintext body)
    const tampered1 = structuredClone(block);
    tampered1.entries[0].envelope = tampered1.entries[0].envelope.replace('"alice"', '"mallory"');
    expect(tampered1.entries[0].envelope, "tamper actually changed the envelope").to.not.equal(block.entries[0].envelope);
    expect(verifyBlock(tampered1, root).ok).to.equal(false);

    // altered reveal
    const tampered2 = structuredClone(block);
    const revealed = tampered2.entries.find((e) => e.reveal)!;
    revealed.reveal!.content = { body: "forged" };
    expect(verifyEntry(revealed, tampered2.anchor, root).ok).to.equal(false);

    // wrong anchored root
    expect(verifyBlock(block, "0".repeat(64)).ok).to.equal(false);
  });
});
