// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SettlementAnchor} from "./SettlementAnchor.sol";

contract SettlementAnchorTest is Test {
  SettlementAnchor anchor;
  address stranger = address(0xBEEF);

  bytes32 constant CHAIN_A = keccak256("ab-ca");
  bytes32 constant CHAIN_B = keccak256("ab-ca-fork");
  bytes32 constant DB = keccak256("defaultdb");

  function setUp() public {
    anchor = new SettlementAnchor(address(this));
    anchor.createChain(CHAIN_A);
  }

  function _header(
    bytes32 chainId,
    uint64 height,
    uint64 fromSeq,
    uint64 toSeq,
    bytes32 bundleRoot,
    bytes32 prevBlockRoot,
    bytes32 prevChainTipHash,
    bytes32 prevAnchorHash,
    uint64 capturedAt,
    uint64 immudbTxId,
    bytes32 immudbTxHash
  ) internal view returns (SettlementAnchor.HeaderFields memory h) {
    h.chainId = chainId;
    h.blockHeight = height;
    h.fromSeq = fromSeq;
    h.toSeq = toSeq;
    h.txCount = uint32(toSeq - fromSeq);
    h.bundleMerkleRoot = bundleRoot;
    h.immudbDb = DB;
    h.immudbTxId = immudbTxId;
    h.immudbTxHash = immudbTxHash;
    h.prevBlockRoot = prevBlockRoot;
    h.prevChainTipHash = prevChainTipHash;
    h.prevAnchorHash = prevAnchorHash;
    h.capturedAt = capturedAt;
    h.chainTipHash = anchor.computeChainTipHash(prevChainTipHash, bundleRoot);
  }

  function _input(SettlementAnchor.HeaderFields memory h)
    internal
    view
    returns (SettlementAnchor.BlockInput memory)
  {
    return SettlementAnchor.BlockInput({
      toSeq: h.toSeq,
      bundleMerkleRoot: h.bundleMerkleRoot,
      immudbDb: h.immudbDb,
      immudbTxId: h.immudbTxId,
      immudbTxHash: h.immudbTxHash,
      capturedAt: h.capturedAt,
      headerHash: anchor.computeHeaderHash(h)
    });
  }

  function test_GenesisAppendInfersHeightAndZeroPrev() public {
    SettlementAnchor.HeaderFields memory h =
      _header(CHAIN_A, 1, 0, 3, keccak256("block1"), bytes32(0), bytes32(0), bytes32(0), 1_700_000_000, 1, keccak256("tx1"));
    anchor.appendBlock(CHAIN_A, _input(h));

    SettlementAnchor.BlockView memory b = anchor.getBlock(CHAIN_A, 1);
    assertEq(b.blockHeight, 1);
    assertEq(b.fromSeq, 0);
    assertEq(b.toSeq, 3);
    assertEq(b.txCount, 3);
    assertEq(b.prevBlockRoot, bytes32(0));
    assertEq(b.chainTipHash, anchor.computeChainTipHash(bytes32(0), keccak256("block1")));
  }

  function test_SecondBlockChainsPrevFromTip() public {
    SettlementAnchor.HeaderFields memory h1 =
      _header(CHAIN_A, 1, 0, 2, keccak256("block1"), bytes32(0), bytes32(0), bytes32(0), 100, 1, keccak256("tx1"));
    anchor.appendBlock(CHAIN_A, _input(h1));
    SettlementAnchor.BlockView memory b1 = anchor.getBlock(CHAIN_A, 1);

    SettlementAnchor.HeaderFields memory h2 = _header(
      CHAIN_A, 2, 2, 5, keccak256("block2"), b1.bundleMerkleRoot, b1.chainTipHash, b1.headerHash, 200, 2, keccak256("tx2")
    );
    anchor.appendBlock(CHAIN_A, _input(h2));

    SettlementAnchor.BlockView memory b2 = anchor.getBlock(CHAIN_A, 2);
    assertEq(b2.fromSeq, 2);
    assertEq(b2.txCount, 3);
    assertEq(b2.prevBlockRoot, keccak256("block1"));
    assertEq(b2.prevAnchorHash, b1.headerHash);
  }

  function test_RejectsBadHeaderHash() public {
    SettlementAnchor.HeaderFields memory h =
      _header(CHAIN_A, 1, 0, 1, keccak256("r"), bytes32(0), bytes32(0), bytes32(0), 1, 1, keccak256("t"));
    SettlementAnchor.BlockInput memory bad = _input(h);
    bad.headerHash = bytes32(uint256(1));
    vm.expectRevert();
    anchor.appendBlock(CHAIN_A, bad);
  }

  function test_RejectsNonIncreasingToSeq() public {
    SettlementAnchor.HeaderFields memory h1 =
      _header(CHAIN_A, 1, 0, 2, keccak256("r1"), bytes32(0), bytes32(0), bytes32(0), 1, 1, keccak256("t1"));
    anchor.appendBlock(CHAIN_A, _input(h1));
    SettlementAnchor.BlockView memory b1 = anchor.getBlock(CHAIN_A, 1);

    SettlementAnchor.HeaderFields memory badH =
      _header(CHAIN_A, 2, 2, 2, keccak256("r2"), b1.bundleMerkleRoot, b1.chainTipHash, b1.headerHash, 2, 2, keccak256("t2"));
    SettlementAnchor.BlockInput memory bad = _input(badH);
    vm.expectRevert();
    anchor.appendBlock(CHAIN_A, bad);
  }

  function test_OnlyOwnerCanAppend() public {
    SettlementAnchor.HeaderFields memory h =
      _header(CHAIN_A, 1, 0, 1, keccak256("r"), bytes32(0), bytes32(0), bytes32(0), 1, 1, keccak256("t"));
    SettlementAnchor.BlockInput memory genesis = _input(h);
    vm.prank(stranger);
    vm.expectRevert();
    anchor.appendBlock(CHAIN_A, genesis);
  }

  function test_ForkThenDiverge() public {
    SettlementAnchor.HeaderFields memory h1 =
      _header(CHAIN_A, 1, 0, 2, keccak256("b1"), bytes32(0), bytes32(0), bytes32(0), 1, 1, keccak256("t1"));
    anchor.appendBlock(CHAIN_A, _input(h1));
    SettlementAnchor.BlockView memory b1 = anchor.getBlock(CHAIN_A, 1);

    SettlementAnchor.HeaderFields memory h2 =
      _header(CHAIN_A, 2, 2, 4, keccak256("b2"), b1.bundleMerkleRoot, b1.chainTipHash, b1.headerHash, 2, 2, keccak256("t2"));
    anchor.appendBlock(CHAIN_A, _input(h2));

    anchor.forkChain(CHAIN_A, 1, keccak256("b1"), CHAIN_B, "correct erroneous block 2");

    SettlementAnchor.HeaderFields memory alt = _header(
      CHAIN_B, 2, 2, 5, keccak256("b2-alt"), b1.bundleMerkleRoot, b1.chainTipHash, b1.headerHash, 3, 2, keccak256("alt")
    );
    anchor.appendBlock(CHAIN_B, _input(alt));

    assertEq(anchor.getBlock(CHAIN_A, 2).bundleMerkleRoot, keccak256("b2"));
    assertEq(anchor.getBlock(CHAIN_B, 2).bundleMerkleRoot, keccak256("b2-alt"));
  }

  function test_BatchAppend() public {
    SettlementAnchor.HeaderFields memory h1 =
      _header(CHAIN_A, 1, 0, 1, keccak256("b1"), bytes32(0), bytes32(0), bytes32(0), 1, 1, keccak256("t1"));
    SettlementAnchor.BlockInput memory g = _input(h1);

    SettlementAnchor.HeaderFields memory h2 = _header(
      CHAIN_A,
      2,
      1,
      3,
      keccak256("b2"),
      keccak256("b1"),
      anchor.computeChainTipHash(bytes32(0), keccak256("b1")),
      g.headerHash,
      2,
      2,
      keccak256("t2")
    );

    SettlementAnchor.BlockInput[] memory batch = new SettlementAnchor.BlockInput[](2);
    batch[0] = g;
    batch[1] = _input(h2);
    anchor.appendBlocks(CHAIN_A, batch);
    assertEq(anchor.tipHeight(CHAIN_A), 2);
  }
}
