import type { CommentNode } from "@/lib/types";

/** Count every node in a comment tree (matches PostView countNodes). */
export function countCommentNodes(nodes: CommentNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countCommentNodes(node.replies), 0);
}

/** Deterministic small integer from a string seed. */
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
