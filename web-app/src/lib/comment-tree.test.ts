import { describe, expect, it } from "vitest";
import type { CommentNode } from "@/lib/types";
import {
  civicCommentParentForReply,
  commentNodeAtPath,
  commentParentPath,
} from "./comment-tree";

function node(id: string, replies: CommentNode[] = []): CommentNode {
  return {
    id,
    author: id,
    handle: id,
    tier: 0,
    ts: "2026-01-01T00:00:00Z",
    body: ["x"],
    up: 0,
    down: 0,
    replies,
  };
}

const tree: CommentNode[] = [
  node("c1", [node("c2", [node("c3")])]),
];

describe("comment-tree", () => {
  it("resolves nodes by path", () => {
    expect(commentNodeAtPath(tree, "0")?.id).toBe("c1");
    expect(commentNodeAtPath(tree, "0.0")?.id).toBe("c2");
    expect(commentNodeAtPath(tree, "0.0.0")?.id).toBe("c3");
  });

  it("uses the reply target as parent below max depth", () => {
    expect(civicCommentParentForReply(node("c1"), "0", 1, tree)).toBe("c1");
    expect(civicCommentParentForReply(node("c2"), "0.0", 2, tree)).toBe("c2");
  });

  it("uses the depth-2 ancestor as parent at max depth", () => {
    expect(commentParentPath("0.0.0")).toBe("0.0");
    expect(civicCommentParentForReply(node("c3"), "0.0.0", 3, tree)).toBe("c2");
  });
});
