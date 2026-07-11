import { describe, expect, it } from "vitest";
import { buildMentionToken } from "@oursay/encode";
import { mentionSegments } from "./segments";
import type { MentionsMap } from "@/lib/types";

const nodeA = "11111111-1111-4111-8111-111111111111";
const nodeB = "22222222-2222-4222-8222-222222222222";
const tokenA = buildMentionToken(nodeA);
const tokenB = buildMentionToken(nodeB);

describe("mentionSegments", () => {
  it("returns plain text when no tokens", () => {
    expect(mentionSegments("Thanks @alice")).toEqual([
      { type: "text", value: "Thanks @alice" },
    ]);
  });

  it("chips profile with route linkable; reserved non-link", () => {
    const mentions: MentionsMap = {
      [nodeA]: {
        display: "alice",
        kind: "profile",
        route: "/profile/alice",
        isSelf: false,
      },
      [nodeB]: {
        display: "QuietOwl07",
        kind: "reserved",
        isSelf: false,
      },
    };
    const segs = mentionSegments(`Hey ${tokenA} and ${tokenB}`, mentions);
    expect(segs).toEqual([
      { type: "text", value: "Hey " },
      {
        type: "mention",
        nodeId: nodeA,
        display: "alice",
        kind: "profile",
        route: "/profile/alice",
        linkable: true,
      },
      { type: "text", value: " and " },
      {
        type: "mention",
        nodeId: nodeB,
        display: "QuietOwl07",
        kind: "reserved",
        linkable: false,
      },
    ]);
  });

  it("missing map entry falls back to Someone non-link", () => {
    const segs = mentionSegments(`orphan ${tokenA}`, {});
    expect(segs[1]).toMatchObject({
      type: "mention",
      display: "Someone",
      kind: "unknown",
      linkable: false,
    });
  });

  it("allowLinks=false never marks chips linkable", () => {
    const mentions: MentionsMap = {
      [nodeA]: {
        display: "alice",
        kind: "profile",
        route: "/profile/alice",
        isSelf: false,
      },
    };
    const segs = mentionSegments(tokenA, mentions, false);
    expect(segs[0]).toMatchObject({ linkable: false, display: "alice" });
  });
});
