import { chainConfig } from "../config.js";
import type { LedgerConnector } from "../ledger/connector.js";
import type { BundleAssembler } from "./assembler.js";
import type { AnchorTarget } from "./target.js";

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

  /** Publish every settled-but-unpublished block to `target`, in order. Returns the heights published. */
  async publish(target: AnchorTarget): Promise<number[]> {
    const latest = await this.connector.fetchLatestBlock(this.chainId);
    if (!latest) return [];

    let prevAnchor = await target.fetchLatestAnchor();
    const lastPublished = prevAnchor?.blockHeight ?? 0;
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
