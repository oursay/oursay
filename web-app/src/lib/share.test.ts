import { describe, expect, it } from "vitest";
import type { CommentNode } from "@/lib/types";
import { commentKey, findCommentForSharePreview } from "./share";

const TS = "2026-06-27T09:00:00Z";

function comment(
  overrides: Partial<CommentNode> & Pick<CommentNode, "handle" | "author">,
): CommentNode {
  return {
    tier: 2,
    ts: TS,
    body: ["hello"],
    up: 0,
    down: 0,
    replies: [],
    ...overrides,
  };
}

describe("findCommentForSharePreview", () => {
  const publicPersona = comment({
    id: "cmt-1",
    author: "SwiftOtter42",
    handle: "SwiftOtter42",
  });

  const privilegedReveal = comment({
    id: "cmt-1",
    author: "Carol",
    handle: "carol",
  });

  const thread = [publicPersona];

  it("matches by stable comment id when handles differ", () => {
    const found = findCommentForSharePreview(thread, {
      commentId: "cmt-1",
      handle: privilegedReveal.handle,
      ts: TS,
    });
    expect(found?.node).toBe(publicPersona);
  });

  it("matches by handle and timestamp when ids are absent", () => {
    const legacy = [comment({ author: "Carol", handle: "carol", ts: TS })];
    const found = findCommentForSharePreview(legacy, {
      handle: "carol",
      ts: TS,
    });
    expect(found?.node.handle).toBe("carol");
  });

  it("falls back to timestamp when privileged handle differs from public persona", () => {
    const found = findCommentForSharePreview(thread, {
      handle: privilegedReveal.handle,
      ts: TS,
    });
    expect(found?.node).toBe(publicPersona);
  });

  it("finds nested comments", () => {
    const nested = comment({
      id: "cmt-2",
      author: "Nested",
      handle: "nested",
      ts: "2026-06-28T10:00:00Z",
    });
    const tree = [
      {
        ...publicPersona,
        replies: [nested],
      },
    ];
    const found = findCommentForSharePreview(tree, { commentId: "cmt-2" });
    expect(found?.depth).toBe(2);
    expect(found?.node).toBe(nested);
  });
});

describe("commentKey", () => {
  it("encodes record id, handle, and timestamp", () => {
    expect(commentKey("post-1", { handle: "carol", ts: TS })).toBe(
      `post-1::c::carol::${TS}`,
    );
  });
});
