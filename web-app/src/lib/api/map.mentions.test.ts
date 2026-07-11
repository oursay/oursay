import { describe, expect, it } from "vitest";
import { mapCommentNode, mapFeedItem, mapRecordDetail } from "./map";

describe("map mentions passthrough", () => {
  const mentions = {
    "11111111-1111-4111-8111-111111111111": {
      display: "alice",
      kind: "profile",
      route: "/profile/alice",
      isSelf: false,
    },
  };

  it("mapFeedItem carries mentions", () => {
    const item = mapFeedItem({
      id: "p1",
      type: "post",
      jurisdiction: "oursay-global",
      tier: "unverified",
      author: "Alice",
      handle: "alice",
      title: "Hi",
      body: ["body"],
      comments: 0,
      mentions,
    });
    expect(item.mentions).toEqual(mentions);
  });

  it("mapRecordDetail carries mentions", () => {
    const detail = mapRecordDetail({
      id: "p1",
      type: "post",
      jurisdiction: "oursay-global",
      tier: "unverified",
      author: "Alice",
      handle: "alice",
      title: "Hi",
      body: ["body"],
      ts: "2026-01-01T00:00:00.000Z",
      edits: 0,
      mentions,
    });
    expect(detail.mentions).toEqual(mentions);
  });

  it("mapCommentNode carries mentions recursively", () => {
    const node = mapCommentNode({
      id: "c1",
      author: "Bob",
      handle: "bob",
      tier: "unverified",
      ts: "2026-01-01T00:00:00.000Z",
      body: ["hi"],
      up: 0,
      down: 0,
      mentions,
      replies: [
        {
          id: "c2",
          author: "Carol",
          handle: "carol",
          tier: "unverified",
          ts: "2026-01-01T00:00:00.000Z",
          body: ["yo"],
          up: 0,
          down: 0,
          mentions: {
            "22222222-2222-4222-8222-222222222222": {
              display: "Someone",
              kind: "reserved",
              isSelf: false,
            },
          },
        },
      ],
    });
    expect(node.mentions).toEqual(mentions);
    expect(node.replies[0]!.mentions?.["22222222-2222-4222-8222-222222222222"]?.display).toBe(
      "Someone",
    );
  });

  it("omits mentions when absent", () => {
    const item = mapFeedItem({
      id: "p1",
      type: "post",
      jurisdiction: "oursay-global",
      tier: "unverified",
      author: "Alice",
      handle: "alice",
      title: "Hi",
      body: ["plain @alice"],
      comments: 0,
    });
    expect(item.mentions).toBeUndefined();
  });
});
