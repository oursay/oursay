import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils";

/** One step of a Merkle inclusion proof: a sibling hash and which side it is on. */
export interface MerkleStep {
  hash: string; // hex
  side: "left" | "right"; // side the sibling sits on, relative to the running hash
}

// RFC-6962-style domain separation so a leaf can never be reinterpreted as an
// internal node (second-preimage resistance).
const LEAF_PREFIX = Uint8Array.of(0x00);
const NODE_PREFIX = Uint8Array.of(0x01);

/** Hash an opaque leaf payload (e.g. a canonical envelope string) into a leaf node. */
export function hashLeaf(payload: string | Uint8Array): string {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  return bytesToHex(sha256(concatBytes(LEAF_PREFIX, bytes)));
}

function hashNode(leftHex: string, rightHex: string): string {
  return bytesToHex(sha256(concatBytes(NODE_PREFIX, hexToBytes(leftHex), hexToBytes(rightHex))));
}

/**
 * Compute the Merkle root over an ordered list of leaf hashes. Odd nodes are
 * promoted (carried up) rather than duplicated. Empty tree => sha256 of empty leaf.
 */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return hashLeaf(new Uint8Array());
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) next.push(hashNode(level[i], level[i + 1]));
      else next.push(level[i]); // promote
    }
    level = next;
  }
  return level[0];
}

/** Build an inclusion proof for the leaf at `index`. */
export function merkleProof(leaves: string[], index: number): MerkleStep[] {
  if (index < 0 || index >= leaves.length) throw new Error(`index ${index} out of range`);
  const proof: MerkleStep[] = [];
  let level = leaves.slice();
  let idx = index;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(hashNode(level[i], level[i + 1]));
        if (i === idx) proof.push({ hash: level[i + 1], side: "right" });
        else if (i + 1 === idx) proof.push({ hash: level[i], side: "left" });
      } else {
        next.push(level[i]); // promoted; no sibling recorded
      }
    }
    idx = Math.floor(idx / 2);
    level = next;
  }
  return proof;
}

/** Recompute the root from a leaf + proof and compare to the expected root. */
export function verifyMerkleProof(leafHash: string, proof: MerkleStep[], expectedRoot: string): boolean {
  let running = leafHash;
  for (const step of proof) {
    running = step.side === "left" ? hashNode(step.hash, running) : hashNode(running, step.hash);
  }
  return running === expectedRoot;
}
