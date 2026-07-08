import { describe, expect, it } from "vitest";
import {
  CheckCircle,
  ClipboardPenLine,
  MessageSquare,
  SquarePen,
} from "lucide-react";
import { activityRowGlyph, ACTIVITY_VOTE_ICON } from "./activityType";
import { RECORD_TYPE_ICON } from "./recordType";
import type { ActivityItem } from "@/lib/types";

function item(partial: Partial<ActivityItem> & Pick<ActivityItem, "kind">): ActivityItem {
  return { text: "", ...partial };
}

describe("activityRowGlyph: direction/tone from item.icon (never from text)", () => {
  it("maps #ic-edit to the pencil icon", () => {
    expect(activityRowGlyph(item({ kind: "comment", icon: "#ic-edit" }))).toEqual({
      type: "icon",
      icon: SquarePen,
    });
  });

  it("maps #ic-check to an up reaction (no alt tone)", () => {
    expect(activityRowGlyph(item({ kind: "reaction", icon: "#ic-check" }))).toEqual({
      type: "reaction",
      dir: "up",
    });
  });

  it("maps #ic-check-alt to an up reaction with the alt tone (retract)", () => {
    expect(activityRowGlyph(item({ kind: "reaction", icon: "#ic-check-alt" }))).toEqual({
      type: "reaction",
      dir: "up",
      alt: true,
    });
  });

  it("maps #ic-x to a down reaction", () => {
    expect(activityRowGlyph(item({ kind: "reaction", icon: "#ic-x" }))).toEqual({
      type: "reaction",
      dir: "down",
    });
  });

  it("ignores display text: icon wins even when the text says the opposite", () => {
    // Old behaviour re-derived direction from a text regex; this fixture proves it's gone.
    expect(
      activityRowGlyph(item({ kind: "reaction", icon: "#ic-x", text: "Agreed with a statement" })),
    ).toEqual({ type: "reaction", dir: "down" });
    // "retract" in text no longer forces up/alt — only the icon id does.
    expect(
      activityRowGlyph(item({ kind: "reaction", icon: "#ic-check", text: "retracted a reaction" })),
    ).toEqual({ type: "reaction", dir: "up" });
  });

  it("falls back to a neutral glyph for a reaction with no recognized icon", () => {
    expect(activityRowGlyph(item({ kind: "reaction", text: "agreed" }))).toEqual({
      type: "icon",
      icon: CheckCircle,
    });
  });
});

describe("activityRowGlyph: kind fallback when no icon override", () => {
  it("comment → message glyph", () => {
    expect(activityRowGlyph(item({ kind: "comment" }))).toEqual({
      type: "icon",
      icon: MessageSquare,
    });
  });

  it("petition → clipboard glyph", () => {
    expect(activityRowGlyph(item({ kind: "petition" }))).toEqual({
      type: "icon",
      icon: ClipboardPenLine,
    });
  });

  it("poll → vote glyph", () => {
    expect(activityRowGlyph(item({ kind: "poll" }))).toEqual({
      type: "icon",
      icon: ACTIVITY_VOTE_ICON,
    });
  });

  it("statement → statement glyph", () => {
    expect(activityRowGlyph(item({ kind: "statement" }))).toEqual({
      type: "icon",
      icon: RECORD_TYPE_ICON.statement,
    });
  });
});
