import { chainConfig } from "../config.js";
import { canonicalJson, sha256Hex } from "../crypto/commitment.js";
import type { BlockHeader, LedgerConnector } from "../ledger/connector.js";
import type { PrivateStore } from "../private/store.js";
import type { BundleAssembler } from "./assembler.js";
import { AnchorIntegrityError } from "./errors.js";
import type { AnchorTarget } from "./target.js";
import type { AnchorRecord, BlockBundle } from "./types.js";

function targetKindLabel(target: AnchorTarget): string {
  return target.kind || target.constructor?.name || "AnchorTarget";
}

/** Build a header-only bundle from a settled block (no Postgres rebuild; empty entries). */
export function headerOnlyBundle(
  header: BlockHeader,
  prevPublishedAnchor: AnchorRecord | undefined,
): BlockBundle {
  const anchor: AnchorRecord = {
    v: 1,
    chainId: header.chainId,
    blockHeight: header.blockHeight,
    fromSeq: header.fromSeq,
    toSeq: header.toSeq,
    txCount: header.txCount,
    bundleMerkleRoot: header.bundleMerkleRoot,
    immudbRoot: header.immudbRoot,
    prevBlockRoot: header.prevBlockRoot,
    chainTipHash: header.chainTipHash,
    prevChainTipHash: header.prevChainTipHash,
    proposer: header.proposer,
    attestations: header.attestations,
    prevAnchorHash: prevPublishedAnchor ? sha256Hex(canonicalJson(prevPublishedAnchor)) : null,
    capturedAt: header.capturedAt,
  };
  return { anchor, entries: [] };
}

/**
 * Replicates SETTLED blocks from the append-only chain to an external {@link AnchorTarget}. This is
 * the publication phase, decoupled from settlement: blocks settle to the chain on the block trigger,
 * and each target receives them on its own cadence (its `publishPolicy`). Every eligible block is
 * published in height order with no gaps, so the target's append-only chain stays contiguous and the
 * offline verifier's `prevAnchorHash` link holds.
 *
 * Idempotent: it resumes from the TARGET's own last-published height (each target is an independent
 * replica with its own cursor), so a re-run never republishes and two fresh targets receive identical
 * bundles for the same settled blocks.
 *
 * Header-only targets (`target.headerOnly`, e.g. EVM) publish from the settled header without
 * rebuilding envelopes from Postgres — required for catch-up after ephemeral chain redeploy when
 * early private-store rows may no longer exist.
 *
 * When `store` is provided and `target.publicWitness` is true, successful publishes advance
 * `anchor_publish_cursor` so product surfaces can expose `externallyAnchored` without RPC.
 */
export class AnchorPublisher {
  constructor(
    private readonly connector: LedgerConnector,
    private readonly assembler: BundleAssembler,
    private readonly chainId: string = chainConfig.chainId,
    private readonly store?: PrivateStore,
  ) {}

  /**
   * If the target has tip height H > 0, require its `bundleMerkleRoot` at H to match the platform
   * header at H. Mismatch throws {@link AnchorIntegrityError} (no append, no auto-fork).
   */
  private async assertTipIntegrity(target: AnchorTarget, tipHeight: number): Promise<void> {
    if (tipHeight <= 0) return;

    const platform = await this.connector.fetchBlockByHeight(this.chainId, tipHeight);
    if (!platform) {
      throw new Error(`settled block ${tipHeight} missing on chain ${this.chainId} (integrity check)`);
    }
    const targetAnchor = await target.fetchAnchor(tipHeight);
    if (!targetAnchor) {
      throw new Error(
        `target tip height ${tipHeight} on chain ${this.chainId} has no anchor at that height`,
      );
    }
    if (targetAnchor.bundleMerkleRoot !== platform.bundleMerkleRoot) {
      throw new AnchorIntegrityError({
        chainId: this.chainId,
        height: tipHeight,
        expectedRoot: platform.bundleMerkleRoot,
        actualRoot: targetAnchor.bundleMerkleRoot,
        targetKind: targetKindLabel(target),
      });
    }
  }

  private async bundleFor(
    target: AnchorTarget,
    header: BlockHeader,
    prevAnchor: AnchorRecord | undefined,
  ): Promise<BlockBundle> {
    if (target.headerOnly) return headerOnlyBundle(header, prevAnchor);
    return this.assembler.assemble(header, prevAnchor);
  }

  private async recordPublicWitnessTip(target: AnchorTarget, published: number[]): Promise<void> {
    if (!this.store || !target.publicWitness || published.length === 0) return;
    const tip = published[published.length - 1]!;
    await this.store.upsertAnchorPublishCursor(this.chainId, target.kind, tip);
  }

  /** Publish every settled-but-unpublished block to `target`, in order. Returns the heights published. */
  async publish(target: AnchorTarget): Promise<number[]> {
    const latest = await this.connector.fetchLatestBlock(this.chainId);
    if (!latest) return [];

    let prevAnchor = await target.fetchLatestAnchor();
    const lastPublished = prevAnchor?.blockHeight ?? 0;
    await this.assertTipIntegrity(target, lastPublished);

    const bundles: BlockBundle[] = [];
    const published: number[] = [];
    for (let h = lastPublished + 1; h <= latest.blockHeight; h++) {
      const header = await this.connector.fetchBlockByHeight(this.chainId, h);
      if (!header) throw new Error(`settled block ${h} missing on chain ${this.chainId}`);
      const bundle = await this.bundleFor(target, header, prevAnchor);
      bundles.push(bundle);
      prevAnchor = bundle.anchor;
      published.push(h);
    }
    if (bundles.length === 0) return [];

    if (typeof target.publishBatch === "function") {
      await target.publishBatch(bundles);
    } else {
      for (const bundle of bundles) await target.publish(bundle);
    }
    await this.recordPublicWitnessTip(target, published);
    return published;
  }

  /**
   * Startup / forced catch-up: integrity-check the target tip, then publish all missing heights
   * with no `everyNBlocks` cadence gate. Use before the steady-state loop (and after ephemeral
   * EVM redeploy + worker restart). Steady-state ticks keep using {@link maybePublish}.
   */
  async catchUp(target: AnchorTarget): Promise<number[]> {
    const latest = await this.connector.fetchLatestBlock(this.chainId);
    if (!latest) return [];

    const tip = await target.fetchLatestAnchor();
    const tipHeight = tip?.blockHeight ?? 0;
    await this.assertTipIntegrity(target, tipHeight);
    return this.publish(target);
  }

  /** Publish only if the target's cadence policy says enough blocks have accumulated; else no-op. */
  async maybePublish(target: AnchorTarget): Promise<number[]> {
    const latest = await this.connector.fetchLatestBlock(this.chainId);
    if (!latest) return [];
    const lastPublished = (await target.fetchLatestAnchor())?.blockHeight ?? 0;
    if (latest.blockHeight <= lastPublished) return [];
    if (!target.publishPolicy.shouldPublish(latest.blockHeight, lastPublished)) return [];
    return this.publish(target);
  }
}

export { AnchorIntegrityError } from "./errors.js";
