import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const CHAIN_A = ethers.id("ab-ca");
const CHAIN_FORK = ethers.id("ab-ca-fork");
const DB = ethers.id("defaultdb");

type HeaderParts = {
  chainId: string;
  height: bigint;
  fromSeq: bigint;
  toSeq: bigint;
  bundleMerkleRoot: string;
  immudbTxId: bigint;
  immudbTxHash: string;
  prevBlockRoot: string;
  prevChainTipHash: string;
  prevAnchorHash: string;
  capturedAt: bigint;
};

type Anchor = Awaited<ReturnType<typeof deploy>>["anchor"];

async function buildInput(anchor: Anchor, p: HeaderParts) {
  const tip = await anchor.computeChainTipHash(p.prevChainTipHash, p.bundleMerkleRoot);
  const fields = {
    chainId: p.chainId,
    blockHeight: p.height,
    fromSeq: p.fromSeq,
    toSeq: p.toSeq,
    txCount: Number(p.toSeq - p.fromSeq),
    bundleMerkleRoot: p.bundleMerkleRoot,
    immudbDb: DB,
    immudbTxId: p.immudbTxId,
    immudbTxHash: p.immudbTxHash,
    prevBlockRoot: p.prevBlockRoot,
    chainTipHash: tip,
    prevChainTipHash: p.prevChainTipHash,
    prevAnchorHash: p.prevAnchorHash,
    capturedAt: p.capturedAt,
  };
  const hash = await anchor.computeHeaderHash(fields);
  return {
    toSeq: p.toSeq,
    bundleMerkleRoot: p.bundleMerkleRoot,
    immudbDb: DB,
    immudbTxId: p.immudbTxId,
    immudbTxHash: p.immudbTxHash,
    capturedAt: p.capturedAt,
    headerHash: hash,
  };
}

async function deploy() {
  const [owner, other] = await ethers.getSigners();
  const anchor = await ethers.deployContract("SettlementAnchor", [owner.address]);
  await anchor.createChain(CHAIN_A);
  return { anchor, owner, other };
}

describe("SettlementAnchor", function () {
  it("anchors genesis then a child with inferred seq and sha256 tip", async function () {
    const { anchor } = await networkHelpers.loadFixture(deploy);
    const root1 = ethers.id("bundle-1");
    const root2 = ethers.id("bundle-2");

    const genesis = await buildInput(anchor, {
      chainId: CHAIN_A,
      height: 1n,
      fromSeq: 0n,
      toSeq: 4n,
      bundleMerkleRoot: root1,
      immudbTxId: 10n,
      immudbTxHash: ethers.id("immudb-tx-10"),
      prevBlockRoot: ethers.ZeroHash,
      prevChainTipHash: ethers.ZeroHash,
      prevAnchorHash: ethers.ZeroHash,
      capturedAt: 1_700_000_000n,
    });

    const tip1 = await anchor.computeChainTipHash(ethers.ZeroHash, root1);
    await expect(anchor.appendBlock(CHAIN_A, genesis))
      .to.emit(anchor, "BlockAnchored")
      .withArgs(CHAIN_A, 1n, root1, tip1, genesis.headerHash, 0n, 4n, 4);

    const b1 = await anchor.getBlock(CHAIN_A, 1n);
    expect(b1.fromSeq).to.equal(0n);
    expect(b1.txCount).to.equal(4);
    expect(b1.chainTipHash).to.equal(tip1);

    const child = await buildInput(anchor, {
      chainId: CHAIN_A,
      height: 2n,
      fromSeq: 4n,
      toSeq: 7n,
      bundleMerkleRoot: root2,
      immudbTxId: 20n,
      immudbTxHash: ethers.id("immudb-tx-20"),
      prevBlockRoot: b1.bundleMerkleRoot,
      prevChainTipHash: b1.chainTipHash,
      prevAnchorHash: b1.headerHash,
      capturedAt: 1_700_000_100n,
    });
    await anchor.appendBlock(CHAIN_A, child);
    const b2 = await anchor.getBlock(CHAIN_A, 2n);
    expect(b2.fromSeq).to.equal(4n);
    expect(b2.txCount).to.equal(3);
    expect(b2.prevAnchorHash).to.equal(b1.headerHash);
  });

  it("rejects bad headerHash and non-increasing toSeq", async function () {
    const { anchor } = await networkHelpers.loadFixture(deploy);
    const genesis = await buildInput(anchor, {
      chainId: CHAIN_A,
      height: 1n,
      fromSeq: 0n,
      toSeq: 5n,
      bundleMerkleRoot: ethers.id("r1"),
      immudbTxId: 1n,
      immudbTxHash: ethers.id("t1"),
      prevBlockRoot: ethers.ZeroHash,
      prevChainTipHash: ethers.ZeroHash,
      prevAnchorHash: ethers.ZeroHash,
      capturedAt: 1n,
    });
    const tampered = { ...genesis, headerHash: ethers.id("x") };
    await expect(anchor.appendBlock(CHAIN_A, tampered)).to.be.revertedWithCustomError(
      anchor,
      "InvalidHeaderHash",
    );

    await anchor.appendBlock(CHAIN_A, genesis);
    const b1 = await anchor.getBlock(CHAIN_A, 1n);
    const bad = await buildInput(anchor, {
      chainId: CHAIN_A,
      height: 2n,
      fromSeq: 5n,
      toSeq: 5n,
      bundleMerkleRoot: ethers.id("r2"),
      immudbTxId: 2n,
      immudbTxHash: ethers.id("t2"),
      prevBlockRoot: b1.bundleMerkleRoot,
      prevChainTipHash: b1.chainTipHash,
      prevAnchorHash: b1.headerHash,
      capturedAt: 2n,
    });
    await expect(anchor.appendBlock(CHAIN_A, bad)).to.be.revertedWithCustomError(anchor, "InvalidToSeq");
  });

  it("rejects non-owner writes", async function () {
    const { anchor, other } = await networkHelpers.loadFixture(deploy);
    const genesis = await buildInput(anchor, {
      chainId: CHAIN_A,
      height: 1n,
      fromSeq: 0n,
      toSeq: 1n,
      bundleMerkleRoot: ethers.id("r"),
      immudbTxId: 1n,
      immudbTxHash: ethers.id("t"),
      prevBlockRoot: ethers.ZeroHash,
      prevChainTipHash: ethers.ZeroHash,
      prevAnchorHash: ethers.ZeroHash,
      capturedAt: 1n,
    });
    await expect(anchor.connect(other).appendBlock(CHAIN_A, genesis)).to.be.revertedWithCustomError(
      anchor,
      "OwnableUnauthorizedAccount",
    );
  });

  it("forks and allows divergent continuation", async function () {
    const { anchor } = await networkHelpers.loadFixture(deploy);
    const root1 = ethers.id("b1");
    const root2 = ethers.id("b2");
    const root2Alt = ethers.id("b2-alt");

    const g = await buildInput(anchor, {
      chainId: CHAIN_A,
      height: 1n,
      fromSeq: 0n,
      toSeq: 2n,
      bundleMerkleRoot: root1,
      immudbTxId: 1n,
      immudbTxHash: ethers.id("i1"),
      prevBlockRoot: ethers.ZeroHash,
      prevChainTipHash: ethers.ZeroHash,
      prevAnchorHash: ethers.ZeroHash,
      capturedAt: 10n,
    });
    await anchor.appendBlock(CHAIN_A, g);
    const b1 = await anchor.getBlock(CHAIN_A, 1n);

    const b2 = await buildInput(anchor, {
      chainId: CHAIN_A,
      height: 2n,
      fromSeq: 2n,
      toSeq: 4n,
      bundleMerkleRoot: root2,
      immudbTxId: 2n,
      immudbTxHash: ethers.id("i2"),
      prevBlockRoot: b1.bundleMerkleRoot,
      prevChainTipHash: b1.chainTipHash,
      prevAnchorHash: b1.headerHash,
      capturedAt: 20n,
    });
    await anchor.appendBlock(CHAIN_A, b2);

    await expect(anchor.forkChain(CHAIN_A, 1n, root1, CHAIN_FORK, "repair"))
      .to.emit(anchor, "ChainForked");

    const alt = await buildInput(anchor, {
      chainId: CHAIN_FORK,
      height: 2n,
      fromSeq: 2n,
      toSeq: 6n,
      bundleMerkleRoot: root2Alt,
      immudbTxId: 99n,
      immudbTxHash: ethers.id("i2-alt"),
      prevBlockRoot: b1.bundleMerkleRoot,
      prevChainTipHash: b1.chainTipHash,
      prevAnchorHash: b1.headerHash,
      capturedAt: 30n,
    });
    await anchor.appendBlock(CHAIN_FORK, alt);
    expect((await anchor.getBlock(CHAIN_A, 2n)).bundleMerkleRoot).to.equal(root2);
    expect((await anchor.getBlock(CHAIN_FORK, 2n)).bundleMerkleRoot).to.equal(root2Alt);
  });
});
