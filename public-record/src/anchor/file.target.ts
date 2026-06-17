import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, canonicalStringify } from "../crypto/commitment.js";
import type { AnchorTarget } from "./target.js";
import type { AnchorRecord, BlockBundle } from "./types.js";

/**
 * The file anchor target: an append-only `anchors.jsonl` (one canonical line per block) plus a
 * `blocks/block-<height>.json` bundle file per block. Human-readable, git-friendly, no git
 * subprocess. This is the primitive a future Git transparency-log connector would push.
 *
 * Integrity is enforced on every read and write: a missing block file, a duplicate height, or a
 * gap/out-of-order in heights throws — the target never silently re-anchors overlapping ranges.
 */
export class FileAnchorTarget implements AnchorTarget {
  private readonly anchorsPath: string;
  private readonly blocksDir: string;

  constructor(private readonly baseDir: string) {
    this.anchorsPath = join(baseDir, "anchors.jsonl");
    this.blocksDir = join(baseDir, "blocks");
  }

  private blockPath(height: number): string {
    return join(this.blocksDir, `block-${String(height).padStart(5, "0")}.json`);
  }

  /** Parse anchors.jsonl and assert it is a contiguous, gap-free, block-file-backed chain. */
  private readAnchors(): AnchorRecord[] {
    if (!existsSync(this.anchorsPath)) return [];
    const lines = readFileSync(this.anchorsPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
    const anchors = lines.map((l) => JSON.parse(l) as AnchorRecord);
    for (let i = 0; i < anchors.length; i++) {
      const expectedHeight = i + 1;
      if (anchors[i].blockHeight !== expectedHeight) {
        throw new Error(
          `anchor target corrupt: line ${i} has blockHeight ${anchors[i].blockHeight}, expected ${expectedHeight} (gap/duplicate/out-of-order)`,
        );
      }
      if (!existsSync(this.blockPath(expectedHeight))) {
        throw new Error(`anchor target corrupt: missing block file for height ${expectedHeight}`);
      }
    }
    return anchors;
  }

  async publish(bundle: BlockBundle): Promise<void> {
    const anchors = this.readAnchors(); // throws if the existing target is inconsistent
    const latest = anchors[anchors.length - 1];

    const expectedHeight = (latest?.blockHeight ?? 0) + 1;
    const expectedFrom = latest?.toSeq ?? 0;
    if (bundle.anchor.blockHeight !== expectedHeight) {
      throw new Error(
        `publish rejected: blockHeight ${bundle.anchor.blockHeight} does not continue the target (expected ${expectedHeight})`,
      );
    }
    if (bundle.anchor.fromSeq !== expectedFrom) {
      throw new Error(
        `publish rejected: fromSeq ${bundle.anchor.fromSeq} does not continue the target (expected ${expectedFrom}) — would overlap published seq ranges`,
      );
    }

    const blockFile = this.blockPath(expectedHeight);
    if (existsSync(blockFile)) {
      throw new Error(`publish rejected: block file already exists for height ${expectedHeight} (append-only)`);
    }

    // Write the bundle first (so an anchor line never references a missing block file).
    mkdirSync(this.blocksDir, { recursive: true });
    writeFileSync(blockFile, canonicalStringify(bundle) + "\n");

    mkdirSync(this.baseDir, { recursive: true });
    const existing = existsSync(this.anchorsPath) ? readFileSync(this.anchorsPath, "utf8") : "";
    writeFileSync(this.anchorsPath, existing + canonicalJson(bundle.anchor) + "\n");
  }

  async fetchLatestAnchor(): Promise<AnchorRecord | undefined> {
    const anchors = this.readAnchors();
    return anchors[anchors.length - 1];
  }

  async fetchAnchor(blockHeight: number): Promise<AnchorRecord | undefined> {
    return this.readAnchors().find((a) => a.blockHeight === blockHeight);
  }

  async fetchBundle(blockHeight: number): Promise<BlockBundle | undefined> {
    const anchors = this.readAnchors(); // integrity gate
    const path = this.blockPath(blockHeight);
    if (!existsSync(path)) return undefined;
    const bundle = JSON.parse(readFileSync(path, "utf8")) as BlockBundle;
    // Cross-check: the bundle's embedded anchor must match the anchors.jsonl line, so a bundle
    // file cannot be swapped independently of the published (independently-fetched) anchor.
    const line = anchors.find((a) => a.blockHeight === blockHeight);
    if (!line || canonicalJson(line) !== canonicalJson(bundle.anchor)) {
      throw new Error(`anchor target corrupt: block ${blockHeight} bundle anchor does not match anchors.jsonl`);
    }
    return bundle;
  }

  async listAnchors(): Promise<AnchorRecord[]> {
    return this.readAnchors();
  }
}
