import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  getBytes,
  AbiCoder,
  id as ethersId,
  type InterfaceAbi,
  type Signer,
} from "ethers";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { anchorTargetsConfig, type EvmAnchorConfig } from "../config.js";
import { type AnchorPublishPolicy, type AnchorTarget, everyNBlocks } from "./target.js";
import type { AnchorRecord, BlockBundle } from "./types.js";
import { computeChainTipHash } from "./verify.js";

/** Synced from Hardhat via `npm run sync:abi -w @oursay/evm-anchor` (ABI array only). */
const abiPath = join(dirname(fileURLToPath(import.meta.url)), "abi", "SettlementAnchor.json");
const SETTLEMENT_ANCHOR_ABI = JSON.parse(readFileSync(abiPath, "utf8")) as InterfaceAbi;

export class UnsupportedEvmBundleError extends Error {
  constructor(message = "EvmAnchorTarget does not store block bundles; use FileAnchorTarget") {
    super(message);
    this.name = "UnsupportedEvmBundleError";
  }
}

export interface EvmAnchorTargetOptions {
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
  /** Public-record string chain id (e.g. ab-ca-gov). Mapped on-chain via keccak256(utf8). */
  chainId: string;
  /** EVM network id for JsonRpcProvider (Hardhat local = 31337). */
  networkChainId?: number;
  publishPolicy?: AnchorPublishPolicy;
  /**
   * Shared signer for all EVM targets that use the same key (e.g. worker multi-chain).
   * Required to avoid nonce collisions when multiple `EvmAnchorTarget` instances publish.
   * Prefer {@link createSharedEvmSigner}.
   */
  signer?: Signer;
}

/**
 * One NonceManager for all EVM targets that share a key — same key must not mint parallel
 * nonces per chain. Used by {@link createEvmTargetsForChains}.
 */
export function createSharedEvmSigner(opts: {
  rpcUrl: string;
  privateKey: string;
  networkChainId?: number;
}): Signer {
  const network = opts.networkChainId ?? 31337;
  return new NonceManager(
    new Wallet(opts.privateKey, new JsonRpcProvider(opts.rpcUrl, network)),
  );
}

/**
 * Build one {@link EvmAnchorTarget} per chain when a contract address is configured; otherwise [].
 * Owns all ethers wiring so callers (worker) never import ethers.
 */
export function createEvmTargetsForChains(
  chains: ReadonlyArray<{ chainId: string; evmEveryNBlocks: number }>,
  config: EvmAnchorConfig,
): EvmAnchorTarget[] {
  if (!config.contractAddress) return [];
  const signer = createSharedEvmSigner({
    rpcUrl: config.rpcUrl,
    privateKey: config.privateKey,
    networkChainId: config.networkChainId,
  });
  return chains.map(
    (c) =>
      new EvmAnchorTarget({
        rpcUrl: config.rpcUrl,
        privateKey: config.privateKey,
        contractAddress: config.contractAddress,
        chainId: c.chainId,
        networkChainId: config.networkChainId,
        publishPolicy: everyNBlocks(c.evmEveryNBlocks),
        signer,
      }),
  );
}

function strip0x(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function asBytes32(hex: string): string {
  const h = strip0x(hex);
  if (h.length !== 64) throw new Error(`expected 32-byte hex, got length ${h.length}`);
  return "0x" + h;
}

function zeroBytes32(): string {
  return "0x" + "00".repeat(32);
}

/** On-chain chain id: keccak256(utf8(chainIdString)) — matches ethers.id / Solidity keccak256(bytes(...)). */
export function onChainChainId(chainId: string): string {
  return ethersId(chainId);
}

export function onChainDbId(dbName: string): string {
  return ethersId(dbName);
}

function isoToUnix(iso: string): bigint {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`invalid capturedAt: ${iso}`);
  return BigInt(Math.floor(ms / 1000));
}

function unixToIso(sec: bigint): string {
  return new Date(Number(sec) * 1000).toISOString();
}

function nullIfZero(hex: string): string | null {
  const h = strip0x(hex);
  return /^0+$/.test(h) ? null : h;
}

/** Match Solidity `sha256(abi.encode(HeaderFields))`. */
export function computeEvmHeaderHash(fields: {
  chainId: string;
  blockHeight: bigint;
  fromSeq: bigint;
  toSeq: bigint;
  txCount: number;
  bundleMerkleRoot: string;
  immudbDb: string;
  immudbTxId: bigint;
  immudbTxHash: string;
  prevBlockRoot: string;
  chainTipHash: string;
  prevChainTipHash: string;
  prevAnchorHash: string;
  capturedAt: bigint;
}): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(bytes32 chainId,uint64 blockHeight,uint64 fromSeq,uint64 toSeq,uint32 txCount,bytes32 bundleMerkleRoot,bytes32 immudbDb,uint64 immudbTxId,bytes32 immudbTxHash,bytes32 prevBlockRoot,bytes32 chainTipHash,bytes32 prevChainTipHash,bytes32 prevAnchorHash,uint64 capturedAt)",
    ],
    [
      {
        chainId: fields.chainId,
        blockHeight: fields.blockHeight,
        fromSeq: fields.fromSeq,
        toSeq: fields.toSeq,
        txCount: fields.txCount,
        bundleMerkleRoot: fields.bundleMerkleRoot,
        immudbDb: fields.immudbDb,
        immudbTxId: fields.immudbTxId,
        immudbTxHash: fields.immudbTxHash,
        prevBlockRoot: fields.prevBlockRoot,
        chainTipHash: fields.chainTipHash,
        prevChainTipHash: fields.prevChainTipHash,
        prevAnchorHash: fields.prevAnchorHash,
        capturedAt: fields.capturedAt,
      },
    ],
  );
  return "0x" + bytesToHex(sha256(getBytes(encoded)));
}

/**
 * Header-only EVM anchor target. Publishes SettlementAnchor block headers; does not store bundles
 * (`fetchBundle` throws). File target remains the bundle store. Tip formula matches public-record
 * Option 1 / on-chain `sha256(prev‖root)`.
 */
export class EvmAnchorTarget implements AnchorTarget {
  /** EVM stores headers only; catch-up must not require BundleAssembler / Postgres txs. */
  readonly headerOnly = true;
  readonly publishPolicy: AnchorPublishPolicy;
  private readonly chainIdStr: string;
  private readonly chainIdBytes32: string;
  private readonly contract: Contract;
  private ensuredChain = false;

  constructor(opts: EvmAnchorTargetOptions) {
    this.chainIdStr = opts.chainId;
    this.chainIdBytes32 = onChainChainId(opts.chainId);
    this.publishPolicy =
      opts.publishPolicy ?? everyNBlocks(anchorTargetsConfig.evmEveryNBlocks);
    const signer =
      opts.signer ??
      new Wallet(
        opts.privateKey,
        new JsonRpcProvider(opts.rpcUrl, opts.networkChainId ?? 31337),
      );
    this.contract = new Contract(opts.contractAddress, SETTLEMENT_ANCHOR_ABI, signer);
  }

  private async ensureChain(): Promise<void> {
    if (this.ensuredChain) return;
    const stats = await this.contract.getChainStats(this.chainIdBytes32);
    if (!stats.exists) {
      await (await this.contract.createChain(this.chainIdBytes32)).wait();
    }
    this.ensuredChain = true;
  }

  /**
   * Build one on-chain BlockInput from a bundle + the current tip snapshot, then return the tip
   * after this block (mirrors SettlementAnchor._appendOne inference).
   */
  private buildAppendInput(
    bundle: BlockBundle,
    tip: {
      tipHeight: number;
      tipToSeq: bigint;
      tipBundleRoot: string;
      tipChainTipHash: string;
      tipHeaderHash: string;
    },
  ): {
    input: {
      toSeq: bigint;
      bundleMerkleRoot: string;
      immudbDb: string;
      immudbTxId: bigint;
      immudbTxHash: string;
      capturedAt: bigint;
      headerHash: string;
    };
    nextTip: {
      tipHeight: number;
      tipToSeq: bigint;
      tipBundleRoot: string;
      tipChainTipHash: string;
      tipHeaderHash: string;
    };
  } {
    const expectedHeight = tip.tipHeight + 1;
    if (bundle.anchor.blockHeight !== expectedHeight) {
      throw new Error(
        `evm publish rejected: blockHeight ${bundle.anchor.blockHeight} != expected ${expectedHeight}`,
      );
    }
    const fromSeq = tip.tipHeight === 0 ? 0n : tip.tipToSeq;
    const toSeq = BigInt(bundle.anchor.toSeq);
    if (BigInt(bundle.anchor.fromSeq) !== fromSeq) {
      throw new Error(
        `evm publish rejected: fromSeq ${bundle.anchor.fromSeq} != inferred ${fromSeq}`,
      );
    }

    const prevBlockRoot = tip.tipHeight === 0 ? zeroBytes32() : tip.tipBundleRoot;
    const prevChainTipHash = tip.tipHeight === 0 ? zeroBytes32() : tip.tipChainTipHash;
    const prevAnchorHash = tip.tipHeight === 0 ? zeroBytes32() : tip.tipHeaderHash;
    const bundleRoot = asBytes32(bundle.anchor.bundleMerkleRoot);
    const chainTipHash = asBytes32(
      computeChainTipHash(
        tip.tipHeight === 0 ? null : strip0x(prevChainTipHash),
        strip0x(bundleRoot),
      ),
    );

    const immudbDb = onChainDbId(bundle.anchor.immudbRoot.db);
    const immudbTxHash = asBytes32(bundle.anchor.immudbRoot.txHashHex);
    const capturedAt = isoToUnix(bundle.anchor.capturedAt);
    const txCount = Number(toSeq - fromSeq);

    const headerHash = computeEvmHeaderHash({
      chainId: this.chainIdBytes32,
      blockHeight: BigInt(expectedHeight),
      fromSeq,
      toSeq,
      txCount,
      bundleMerkleRoot: bundleRoot,
      immudbDb,
      immudbTxId: BigInt(bundle.anchor.immudbRoot.txId),
      immudbTxHash,
      prevBlockRoot,
      chainTipHash,
      prevChainTipHash,
      prevAnchorHash,
      capturedAt,
    });

    return {
      input: {
        toSeq,
        bundleMerkleRoot: bundleRoot,
        immudbDb,
        immudbTxId: BigInt(bundle.anchor.immudbRoot.txId),
        immudbTxHash,
        capturedAt,
        headerHash,
      },
      nextTip: {
        tipHeight: expectedHeight,
        tipToSeq: toSeq,
        tipBundleRoot: bundleRoot,
        tipChainTipHash: chainTipHash,
        tipHeaderHash: headerHash,
      },
    };
  }

  async publish(bundle: BlockBundle): Promise<void> {
    await this.publishBatch([bundle]);
  }

  /** One `appendBlocks` tx for the whole contiguous gap (SettlementAnchor batch entrypoint). */
  async publishBatch(bundles: BlockBundle[]): Promise<void> {
    if (bundles.length === 0) return;
    await this.ensureChain();
    const stats = await this.contract.getChainStats(this.chainIdBytes32);
    let tip = {
      tipHeight: Number(stats.tipHeight),
      tipToSeq: BigInt(stats.tipToSeq),
      tipBundleRoot: stats.tipBundleRoot as string,
      tipChainTipHash: stats.tipChainTipHash as string,
      tipHeaderHash: stats.tipHeaderHash as string,
    };

    const inputs = [];
    for (const bundle of bundles) {
      const { input, nextTip } = this.buildAppendInput(bundle, tip);
      inputs.push(input);
      tip = nextTip;
    }

    const tx = await this.contract.appendBlocks(this.chainIdBytes32, inputs);
    await tx.wait();
  }

  async fetchLatestAnchor(): Promise<AnchorRecord | undefined> {
    await this.ensureChain();
    const stats = await this.contract.getChainStats(this.chainIdBytes32);
    if (!stats.exists || Number(stats.tipHeight) === 0) return undefined;
    return this.fetchAnchor(Number(stats.tipHeight));
  }

  async fetchAnchor(blockHeight: number): Promise<AnchorRecord | undefined> {
    await this.ensureChain();
    const stats = await this.contract.getChainStats(this.chainIdBytes32);
    if (!stats.exists || blockHeight < 1 || blockHeight > Number(stats.tipHeight)) return undefined;
    const view = await this.contract.getBlock(this.chainIdBytes32, BigInt(blockHeight));
    return this.viewToAnchor(view);
  }

  async fetchBundle(_blockHeight: number): Promise<BlockBundle | undefined> {
    throw new UnsupportedEvmBundleError();
  }

  async listAnchors(): Promise<AnchorRecord[]> {
    await this.ensureChain();
    const stats = await this.contract.getChainStats(this.chainIdBytes32);
    const tip = Number(stats.tipHeight);
    const out: AnchorRecord[] = [];
    for (let h = 1; h <= tip; h++) {
      const a = await this.fetchAnchor(h);
      if (a) out.push(a);
    }
    return out;
  }

  private viewToAnchor(view: {
    blockHeight: bigint;
    fromSeq: bigint;
    toSeq: bigint;
    txCount: bigint | number;
    bundleMerkleRoot: string;
    immudbRoot: { db: string; txId: bigint; txHash: string };
    prevBlockRoot: string;
    chainTipHash: string;
    prevChainTipHash: string;
    prevAnchorHash: string;
    headerHash: string;
    capturedAt: bigint;
  }): AnchorRecord {
    return {
      v: 1,
      chainId: this.chainIdStr,
      blockHeight: Number(view.blockHeight),
      fromSeq: Number(view.fromSeq),
      toSeq: Number(view.toSeq),
      txCount: Number(view.txCount),
      bundleMerkleRoot: strip0x(view.bundleMerkleRoot),
      immudbRoot: {
        db: strip0x(view.immudbRoot.db),
        txId: Number(view.immudbRoot.txId),
        txHashHex: strip0x(view.immudbRoot.txHash),
      },
      prevBlockRoot: nullIfZero(view.prevBlockRoot),
      chainTipHash: strip0x(view.chainTipHash),
      prevChainTipHash: nullIfZero(view.prevChainTipHash),
      // EVM link uses on-chain headerHash (not file-target sha256(canonicalJson(prev))).
      prevAnchorHash: nullIfZero(view.prevAnchorHash),
      proposer: null,
      attestations: [],
      capturedAt: unixToIso(view.capturedAt),
    };
  }
}
