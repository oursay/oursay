import { chainConfig } from "../config.js";
import type { LedgerConnector } from "../ledger/connector.js";
import type { BundleAssembler } from "./assembler.js";
import { AnchorIntegrityError } from "./errors.js";
import type { AnchorTarget } from "./target.js";

function targetKind(target: AnchorTarget): string {
  return target.constructor?.name || "AnchorTarget";
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
 */
export class AnchorPublisher {
  constructor(
    private readonly connector: LedgerConnector,
    private readonly assembler: BundleAssembler,
    private readonly chainId: string = chainConfig.chainId,
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
        targetKind: targetKind(target),
      });
    }
  }

  /** Publish every settled-but-unpublished block to `target`, in order. Returns the heights published. */
  async publish(target: AnchorTarget): Promise<number[]> {
    const latest = await this.connector.fetchLatestBlock(this.chainId);
    if (!latest) return [];

    let prevAnchor = await target.fetchLatestAnchor();
    const lastPublished = prevAnchor?.blockHeight ?? 0;
    await this.assertTipIntegrity(target, lastPublished);

    const published: number[] = [];
    for (let h = lastPublished + 1; h <= latest.blockHeight; h++) {
      const header = await this.connector.fetchBlockByHeight(this.chainId, h);
      if (!header) throw new Error(`settled block ${h} missing on chain ${this.chainId}`);
      const bundle = await this.assembler.assemble(header, prevAnchor);
      await target.publish(bundle);
      prevAnchor = bundle.anchor;
      published.push(h);
    }
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
