import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalJson } from "./commitment.js";
import type { AnchorRecord } from "./types.js";

/**
 * GitHub anchoring: append the anchor record to an `anchors.jsonl` file in a PUBLIC
 * repo and tag the commit. Public, cheap, human-auditable, timestamped by GitHub's
 * commit graph. This module produces the exact artifact + tag name that would be
 * committed; the actual `git push` is an ops step, demonstrated here against a file.
 */

/** One canonical JSONL line per anchor (stable, diff-friendly, append-only). */
export function anchorLine(anchor: AnchorRecord): string {
  return canonicalJson(anchor);
}

/** Deterministic tag name binding the immudb tx height and a short root fingerprint. */
export function anchorTagName(anchor: AnchorRecord): string {
  return `anchor-tx${anchor.immudbRoot.txid}-${anchor.bundleMerkleRoot.slice(0, 12)}`;
}

/** Append an anchor to a local anchors.jsonl (stands in for the public repo file). */
export function appendAnchorFile(path: string, anchor: AnchorRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  let existing = "";
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    existing = "";
  }
  writeFileSync(path, existing + anchorLine(anchor) + "\n");
}

/** Read back the most recent anchored Merkle root from the file (auditor fetch). */
export function readLatestAnchoredRoot(path: string): string {
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]) as AnchorRecord;
  return last.bundleMerkleRoot;
}
