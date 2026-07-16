import { describe, expect, it } from "vitest";
import { buildMentionToken } from "@oursay/encode";
import { GLOBAL_ID } from "@/lib/types";
import type { CommentNode, RecordDetail } from "@/lib/types";
import { mentionSegments } from "@/lib/mentions/segments";
import { buildSharePreview } from "./preview";
import type { ShareTarget } from "@/lib/state";

const nodeId = "11111111-1111-4111-8111-111111111111";
const token = buildMentionToken(nodeId);

const publicMentions = {
  [nodeId]: {
    display: "alice",
    kind: "profile" as const,
    route: "/profile/alice",
    isSelf: false,
  },
};

const detailWithMention: RecordDetail = {
  id: "rec-1",
  kind: "statement",
  jurisdiction: GLOBAL_ID,
  tier: 0,
  districts: [],
  author: "Bob",
  handle: "bob",
  title: `Hello ${token}`,
  body: [`Calling ${token} publicly.`],
  ts: "2026-01-01T00:00:00.000Z",
  edits: 0,
  mentions: publicMentions,
};

describe("buildSharePreview mentions", () => {
  it("carries public mention metadata onto record share cards", () => {
    const target: ShareTarget = {
      variant: "record",
      shareKey: "rec-1",
      path: "/post/rec-1",
      author: "Bob",
      body: [],
      tier: 0,
    };
    const preview = buildSharePreview(
      target,
      { ...detailWithMention, externallyAnchored: true },
      [],
    );
    expect(preview?.variant).toBe("record");
    if (preview?.variant !== "record") return;

    expect(preview.item.mentions).toEqual(publicMentions);
    expect(preview.ts).toBe(detailWithMention.ts);
    expect(preview.externallyAnchored).toBe(true);
    expect(preview.item.externallyAnchored).toBe(true);

    // Same path ShareCard uses: chips resolve to the public profile display.
    const titleSegs = mentionSegments(
      preview.item.title,
      preview.item.mentions,
      false,
    );
    expect(titleSegs).toContainEqual({
      type: "mention",
      nodeId,
      display: "alice",
      kind: "profile",
      route: "/profile/alice",
      linkable: false,
    });
  });

  it("keeps comment-node mentions for comment share cards", () => {
    const comment: CommentNode = {
      id: "c1",
      author: "Carol",
      handle: "carol",
      tier: 0,
      ts: "2026-01-01T00:00:00.000Z",
      body: [`Ping ${token}`],
      up: 0,
      down: 0,
      replies: [],
      mentions: publicMentions,
    };
    const target: ShareTarget = {
      variant: "comment",
      shareKey: "rec-1::c::carol::2026-01-01T00:00:00.000Z",
      path: "/post/rec-1",
      author: "Carol",
      handle: "carol",
      body: comment.body,
      tier: 0,
      commentId: "c1",
    };
    const preview = buildSharePreview(target, detailWithMention, [comment]);
    expect(preview?.variant).toBe("comment");
    if (preview?.variant !== "comment") return;
    expect(preview.node.mentions).toEqual(publicMentions);
  });
});
