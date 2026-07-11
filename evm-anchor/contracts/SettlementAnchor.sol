// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SettlementAnchor
 * @notice Owner-controlled on-chain witness for OurSay public-record block settlement.
 * @dev Multi-chain (one `chainId` per jurisdiction/genesis). Callers submit minimal block
 *      fields; the contract infers height, prev links, and tip fold, then requires the
 *      submitted `headerHash` to match the reconstructed header.
 *
 *      On-chain tip fold (bytes32(0) stands for off-chain `null`):
 *        chainTipHash = keccak256(abi.encode(prevChainTipHash, bundleMerkleRoot))
 *
 *      This packing is the EVM commitment scheme — it is not byte-identical to the
 *      off-chain `sha256(canonicalJson({prevChainTipHash, bundleMerkleRoot}))` tip.
 *      Store the same `bundleMerkleRoot` / immudb witness bytes the ledger produced;
 *      treat `chainTipHash` / `headerHash` as the on-chain linkage proofs.
 *
 *      Compiled without optimizer / viaIR — helpers keep the stack shallow.
 */
contract SettlementAnchor is Ownable {
  // ─── Types ───────────────────────────────────────────────────────────────

  struct ImmudbRoot {
    bytes32 db;
    uint64 txId;
    bytes32 txHash;
  }

  /// @dev Packed storage. Prev links are not stored — inferred from tip / height-1.
  struct BlockData {
    uint64 fromSeq;
    uint64 toSeq;
    uint32 txCount;
    bytes32 bundleMerkleRoot;
    bytes32 immudbDb;
    uint64 immudbTxId;
    bytes32 immudbTxHash;
    bytes32 chainTipHash;
    bytes32 headerHash;
    uint64 capturedAt;
  }

  /// @dev AnchorRecord-shaped view including inferred prev* fields.
  struct BlockView {
    bytes32 chainId;
    uint64 blockHeight;
    uint64 fromSeq;
    uint64 toSeq;
    uint32 txCount;
    bytes32 bundleMerkleRoot;
    ImmudbRoot immudbRoot;
    bytes32 prevBlockRoot;
    bytes32 chainTipHash;
    bytes32 prevChainTipHash;
    bytes32 prevAnchorHash;
    bytes32 headerHash;
    uint64 capturedAt;
  }

  struct ChainStats {
    bool exists;
    uint64 tipHeight;
    bytes32 tipBundleRoot;
    bytes32 tipChainTipHash;
    bytes32 tipHeaderHash;
    uint64 tipToSeq;
    bytes32 parentChain;
    uint64 forkHeight;
    string forkReason;
  }

  /// @dev Minimal append input. Height and prev* are inferred on-chain.
  struct BlockInput {
    uint64 fromSeq;
    uint64 toSeq;
    uint32 txCount;
    bytes32 bundleMerkleRoot;
    bytes32 immudbDb;
    uint64 immudbTxId;
    bytes32 immudbTxHash;
    uint64 capturedAt;
    bytes32 headerHash;
  }

  /// @dev Fields committed by `headerHash` (order is consensus-critical).
  struct HeaderFields {
    bytes32 chainId;
    uint64 blockHeight;
    uint64 fromSeq;
    uint64 toSeq;
    uint32 txCount;
    bytes32 bundleMerkleRoot;
    bytes32 immudbDb;
    uint64 immudbTxId;
    bytes32 immudbTxHash;
    bytes32 prevBlockRoot;
    bytes32 chainTipHash;
    bytes32 prevChainTipHash;
    bytes32 prevAnchorHash;
    uint64 capturedAt;
  }

  struct ChainState {
    bool exists;
    uint64 tipHeight;
    bytes32 tipBundleRoot;
    bytes32 tipChainTipHash;
    bytes32 tipHeaderHash;
    uint64 tipToSeq;
    bytes32 parentChain;
    uint64 forkHeight;
    string forkReason;
  }

  mapping(bytes32 chainId => ChainState) private _chains;
  mapping(bytes32 chainId => mapping(uint64 height => BlockData)) private _blocks;
  mapping(bytes32 chainId => mapping(uint64 height => bool)) private _blockPresent;

  event ChainCreated(bytes32 indexed chainId, address indexed owner);
  event BlockAnchored(
    bytes32 indexed chainId,
    uint64 indexed blockHeight,
    bytes32 bundleMerkleRoot,
    bytes32 chainTipHash,
    bytes32 headerHash,
    uint64 fromSeq,
    uint64 toSeq,
    uint32 txCount
  );
  event ChainForked(
    bytes32 indexed sourceChainId,
    bytes32 indexed newChainId,
    uint64 indexed atHeight,
    bytes32 atBlockHash,
    string reason
  );

  error ChainAlreadyExists(bytes32 chainId);
  error ChainNotFound(bytes32 chainId);
  error BlockNotFound(bytes32 chainId, uint64 height);
  error InvalidSeqRange(uint64 fromSeq, uint64 toSeq, uint32 txCount);
  error SeqNotContiguous(uint64 expectedFromSeq, uint64 actualFromSeq);
  error InvalidHeaderHash(bytes32 expected, bytes32 actual);
  error ForkHeightOutOfRange(uint64 atHeight, uint64 tipHeight);
  error ForkBlockHashMismatch(bytes32 expected, bytes32 actual);
  error EmptyForkReason();
  error EmptyBatch();

  constructor(address initialOwner) Ownable(initialOwner) {}

  // ─── Pure helpers ────────────────────────────────────────────────────────

  function computeChainTipHash(bytes32 prevChainTipHash, bytes32 bundleMerkleRoot)
    public
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(prevChainTipHash, bundleMerkleRoot));
  }

  function computeHeaderHash(HeaderFields memory h) public pure returns (bytes32) {
    return keccak256(abi.encode(h));
  }

  // ─── Writes ──────────────────────────────────────────────────────────────

  function createChain(bytes32 chainId) external onlyOwner {
    if (_chains[chainId].exists) revert ChainAlreadyExists(chainId);
    _chains[chainId].exists = true;
    emit ChainCreated(chainId, msg.sender);
  }

  function appendBlocks(bytes32 chainId, BlockInput[] calldata inputs) external onlyOwner {
    uint256 n = inputs.length;
    if (n == 0) revert EmptyBatch();
    for (uint256 i = 0; i < n; ) {
      _appendOne(chainId, inputs[i]);
      unchecked {
        ++i;
      }
    }
  }

  function appendBlock(bytes32 chainId, BlockInput calldata input) external onlyOwner {
    _appendOne(chainId, input);
  }

  /**
   * @notice Fork `sourceChainId` at `atHeight` into `newChainId`.
   * @dev Heights 1..atHeight resolve through the parent; later appends are local.
   *      `atBlockHash` must equal that height's `bundleMerkleRoot`. `reason` is stored + emitted.
   */
  function forkChain(
    bytes32 sourceChainId,
    uint64 atHeight,
    bytes32 atBlockHash,
    bytes32 newChainId,
    string calldata reason
  ) external onlyOwner {
    if (!_chains[sourceChainId].exists) revert ChainNotFound(sourceChainId);
    if (_chains[newChainId].exists) revert ChainAlreadyExists(newChainId);
    if (atHeight == 0 || atHeight > _chains[sourceChainId].tipHeight) {
      revert ForkHeightOutOfRange(atHeight, _chains[sourceChainId].tipHeight);
    }
    if (bytes(reason).length == 0) revert EmptyForkReason();

    bytes32 storageChain = _storageChainForHeight(sourceChainId, atHeight);
    if (!_blockPresent[storageChain][atHeight]) revert BlockNotFound(sourceChainId, atHeight);
    BlockData storage atBlock = _blocks[storageChain][atHeight];
    if (atBlock.bundleMerkleRoot != atBlockHash) {
      revert ForkBlockHashMismatch(atBlock.bundleMerkleRoot, atBlockHash);
    }

    _writeForkTip(newChainId, sourceChainId, atHeight, atBlock, reason);
    emit ChainForked(sourceChainId, newChainId, atHeight, atBlockHash, reason);
  }

  // ─── Views ───────────────────────────────────────────────────────────────

  function getChainStats(bytes32 chainId) external view returns (ChainStats memory stats) {
    ChainState storage c = _chains[chainId];
    stats.exists = c.exists;
    stats.tipHeight = c.tipHeight;
    stats.tipBundleRoot = c.tipBundleRoot;
    stats.tipChainTipHash = c.tipChainTipHash;
    stats.tipHeaderHash = c.tipHeaderHash;
    stats.tipToSeq = c.tipToSeq;
    stats.parentChain = c.parentChain;
    stats.forkHeight = c.forkHeight;
    stats.forkReason = c.forkReason;
  }

  function tipHeight(bytes32 chainId) external view returns (uint64) {
    if (!_chains[chainId].exists) revert ChainNotFound(chainId);
    return _chains[chainId].tipHeight;
  }

  function getBlock(bytes32 chainId, uint64 height) public view returns (BlockView memory view_) {
    if (!_chains[chainId].exists) revert ChainNotFound(chainId);
    if (height == 0 || height > _chains[chainId].tipHeight) revert BlockNotFound(chainId, height);

    bytes32 storageChain = _storageChainForHeight(chainId, height);
    if (!_blockPresent[storageChain][height]) revert BlockNotFound(chainId, height);

    _fillBlockView(view_, chainId, height, _blocks[storageChain][height]);
    if (height > 1) {
      _fillPrevLinks(view_, chainId, height);
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  function _appendOne(bytes32 chainId, BlockInput calldata input) private {
    ChainState storage chain = _chains[chainId];
    if (!chain.exists) revert ChainNotFound(chainId);
    _validateSeq(chain, input);

    uint64 height = chain.tipHeight + 1;
    bytes32 expectedHeader = _expectedHeaderHash(chainId, height, input, chain);
    if (input.headerHash != expectedHeader) {
      revert InvalidHeaderHash(expectedHeader, input.headerHash);
    }

    _storeAndAdvance(chainId, height, input, expectedHeader, chain);
  }

  function _validateSeq(ChainState storage chain, BlockInput calldata input) private view {
    if (input.toSeq <= input.fromSeq || input.txCount == 0) {
      revert InvalidSeqRange(input.fromSeq, input.toSeq, input.txCount);
    }
    if (uint64(input.txCount) != input.toSeq - input.fromSeq) {
      revert InvalidSeqRange(input.fromSeq, input.toSeq, input.txCount);
    }
    uint64 expectedFrom = chain.tipHeight == 0 ? 0 : chain.tipToSeq;
    if (input.fromSeq != expectedFrom) {
      revert SeqNotContiguous(expectedFrom, input.fromSeq);
    }
  }

  function _expectedHeaderHash(
    bytes32 chainId,
    uint64 height,
    BlockInput calldata input,
    ChainState storage chain
  ) private view returns (bytes32) {
    HeaderFields memory h;
    h.chainId = chainId;
    h.blockHeight = height;
    h.fromSeq = input.fromSeq;
    h.toSeq = input.toSeq;
    h.txCount = input.txCount;
    h.bundleMerkleRoot = input.bundleMerkleRoot;
    h.immudbDb = input.immudbDb;
    h.immudbTxId = input.immudbTxId;
    h.immudbTxHash = input.immudbTxHash;
    h.capturedAt = input.capturedAt;

    if (chain.tipHeight == 0) {
      h.prevBlockRoot = bytes32(0);
      h.prevChainTipHash = bytes32(0);
      h.prevAnchorHash = bytes32(0);
    } else {
      h.prevBlockRoot = chain.tipBundleRoot;
      h.prevChainTipHash = chain.tipChainTipHash;
      h.prevAnchorHash = chain.tipHeaderHash;
    }

    h.chainTipHash = computeChainTipHash(h.prevChainTipHash, h.bundleMerkleRoot);
    return computeHeaderHash(h);
  }

  function _storeAndAdvance(
    bytes32 chainId,
    uint64 height,
    BlockInput calldata input,
    bytes32 headerHash,
    ChainState storage chain
  ) private {
    bytes32 tip = computeChainTipHash(
      height == 1 ? bytes32(0) : chain.tipChainTipHash,
      input.bundleMerkleRoot
    );

    BlockData storage b = _blocks[chainId][height];
    b.fromSeq = input.fromSeq;
    b.toSeq = input.toSeq;
    b.txCount = input.txCount;
    b.bundleMerkleRoot = input.bundleMerkleRoot;
    b.immudbDb = input.immudbDb;
    b.immudbTxId = input.immudbTxId;
    b.immudbTxHash = input.immudbTxHash;
    b.chainTipHash = tip;
    b.headerHash = headerHash;
    b.capturedAt = input.capturedAt;
    _blockPresent[chainId][height] = true;

    chain.tipHeight = height;
    chain.tipBundleRoot = input.bundleMerkleRoot;
    chain.tipChainTipHash = tip;
    chain.tipHeaderHash = headerHash;
    chain.tipToSeq = input.toSeq;

    emit BlockAnchored(
      chainId, height, input.bundleMerkleRoot, tip, headerHash, input.fromSeq, input.toSeq, input.txCount
    );
  }

  function _writeForkTip(
    bytes32 newChainId,
    bytes32 sourceChainId,
    uint64 atHeight,
    BlockData storage atBlock,
    string calldata reason
  ) private {
    ChainState storage fork = _chains[newChainId];
    fork.exists = true;
    fork.tipHeight = atHeight;
    fork.tipBundleRoot = atBlock.bundleMerkleRoot;
    fork.tipChainTipHash = atBlock.chainTipHash;
    fork.tipHeaderHash = atBlock.headerHash;
    fork.tipToSeq = atBlock.toSeq;
    fork.parentChain = sourceChainId;
    fork.forkHeight = atHeight;
    fork.forkReason = reason;
  }

  function _fillBlockView(
    BlockView memory view_,
    bytes32 chainId,
    uint64 height,
    BlockData storage b
  ) private view {
    view_.chainId = chainId;
    view_.blockHeight = height;
    view_.fromSeq = b.fromSeq;
    view_.toSeq = b.toSeq;
    view_.txCount = b.txCount;
    view_.bundleMerkleRoot = b.bundleMerkleRoot;
    view_.immudbRoot.db = b.immudbDb;
    view_.immudbRoot.txId = b.immudbTxId;
    view_.immudbRoot.txHash = b.immudbTxHash;
    view_.chainTipHash = b.chainTipHash;
    view_.headerHash = b.headerHash;
    view_.capturedAt = b.capturedAt;
  }

  function _fillPrevLinks(BlockView memory view_, bytes32 chainId, uint64 height) private view {
    bytes32 prevStorage = _storageChainForHeight(chainId, height - 1);
    if (!_blockPresent[prevStorage][height - 1]) revert BlockNotFound(chainId, height - 1);
    BlockData storage prev = _blocks[prevStorage][height - 1];
    view_.prevBlockRoot = prev.bundleMerkleRoot;
    view_.prevChainTipHash = prev.chainTipHash;
    view_.prevAnchorHash = prev.headerHash;
  }

  function _storageChainForHeight(bytes32 chainId, uint64 height) private view returns (bytes32) {
    ChainState storage c = _chains[chainId];
    if (c.parentChain != bytes32(0) && height <= c.forkHeight) {
      return _storageChainForHeight(c.parentChain, height);
    }
    return chainId;
  }
}
