import { COMMENT_MAX_DEPTH, type CommentNode } from "@/lib/types";

/** Resolve a comment node from a dot-separated index path (e.g. `0.1.2`). */
export function commentNodeAtPath(
  nodes: CommentNode[],
  path: string,
): CommentNode | undefined {
  if (!path) return undefined;
  const parts = path.split(".").map((p) => Number(p));
  let level = nodes;
  let node: CommentNode | undefined;
  for (const i of parts) {
    node = level[i];
    if (!node) return undefined;
    level = node.replies;
  }
  return node;
}

/** Parent path for a dot-separated tree path (`0.1.2` → `0.1`). */
export function commentParentPath(path: string): string | null {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? null : path.slice(0, idx);
}

/**
 * Civic parent id for a reply. At max visual depth the reply attaches to the
 * depth-(MAX-1) ancestor (2nd level when MAX=3) so the server depth gate passes;
 * the @handle prefix in the body carries who is being addressed.
 */
export function civicCommentParentForReply(
  node: CommentNode,
  nodePath: string,
  depth: number,
  tree: CommentNode[],
): string | undefined {
  if (depth < COMMENT_MAX_DEPTH) return node.id;
  const parentPath = commentParentPath(nodePath);
  if (!parentPath) return node.id;
  return commentNodeAtPath(tree, parentPath)?.id ?? node.id;
}
