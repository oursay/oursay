import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  applyMentionSelection,
  filterMentionRoster,
  isMentionAt,
  parseAtSpans,
  resolveComposeMentions,
  resolveComposeMentionsFields,
  type MentionRoster,
} from "./compose";

const roster: MentionRoster = {
  personas: [
    {
      label: "CuriousFox12",
      display: "CuriousFox12",
      candidate: { kind: "persona", personaName: "CuriousFox12" },
    },
  ],
  profiles: [
    {
      label: "alice",
      display: "alice",
      candidate: { kind: "profile", handle: "alice" },
    },
  ],
};

describe("parseAtSpans", () => {
  it("finds @handles and skips emails / empty @", () => {
    expect(parseAtSpans("hi @alice and @CuriousFox12")).toEqual([
      { start: 3, end: 9, raw: "alice" },
      { start: 14, end: 27, raw: "CuriousFox12" },
    ]);
    expect(parseAtSpans("me@email.com")).toEqual([]);
    expect(parseAtSpans("meet @ 4pm")).toEqual([]);
    expect(parseAtSpans("neighbourhood @ ")).toEqual([]);
  });

  it("isMentionAt rejects email-like @", () => {
    expect(isMentionAt("me@email.com", 2)).toBe(false);
    expect(isMentionAt("@alice", 0)).toBe(true);
    expect(isMentionAt(" hi @bob", 4)).toBe(true);
  });
});

describe("resolveComposeMentions", () => {
  it("keeps related spans and rewrites unknown to @Someone", () => {
    const r = resolveComposeMentions("Thanks @alice and @nobody", roster);
    expect(r.text).toBe("Thanks @alice and @Someone");
    expect(r.mentionSpans).toEqual(["@alice", "@Someone"]);
    expect(r.mentions).toEqual([
      { kind: "profile", handle: "alice" },
      { kind: "profile", handle: "nobody" },
    ]);
  });

  it("matches in-thread personas", () => {
    const r = resolveComposeMentions("cc @CuriousFox12", roster);
    expect(r.mentions[0]).toEqual({ kind: "persona", personaName: "CuriousFox12" });
    expect(r.mentionSpans).toEqual(["@CuriousFox12"]);
  });

  it("leaves plain text without @ unchanged and emits no candidates", () => {
    const r = resolveComposeMentions("plain @alice text".replace("@alice", "alice"), roster);
    expect(r.mentions).toEqual([]);
    expect(r.text).toBe("plain alice text");
  });

  it("resolves fields in title-then-body order", () => {
    const r = resolveComposeMentionsFields(
      { title: "Hey @alice", body: "and @ghost" },
      ["title", "body"],
      roster,
    );
    expect(r.fields.title).toBe("Hey @alice");
    expect(r.fields.body).toBe("and @Someone");
    expect(r.mentionSpans).toEqual(["@alice", "@Someone"]);
  });
});

describe("typeahead helpers", () => {
  it("activeMentionQuery reads the @ fragment at caret", () => {
    expect(activeMentionQuery("hi @al", 6)).toEqual({ start: 3, query: "al" });
    expect(activeMentionQuery("hi @al ", 7)).toBeNull();
  });

  it("filterMentionRoster matches prefix", () => {
    expect(filterMentionRoster(roster, "cu").map((e) => e.label)).toEqual(["CuriousFox12"]);
    expect(filterMentionRoster(roster, "a").map((e) => e.label)).toEqual(["alice"]);
  });

  it("applyMentionSelection inserts display + space", () => {
    const next = applyMentionSelection("hi @al", 6, roster.profiles[0]!);
    expect(next.text).toBe("hi @alice ");
    expect(next.caret).toBe("hi @alice ".length);
  });
});
