import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  applyMentionSelection,
  composeHighlightSegments,
  filterMentionRoster,
  isMentionAt,
  MENTION_TYPEAHEAD_LIMIT,
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
      label: "ableg",
      display: "ableg",
      aliases: ["Alberta Legislature", "AblegOffice"],
      candidate: { kind: "profile", handle: "ableg" },
    },
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

  it("resolves single-token display-name alias to @handle", () => {
    const r = resolveComposeMentions("ping @AblegOffice", roster);
    expect(r.text).toBe("ping @ableg");
    expect(r.mentionSpans).toEqual(["@ableg"]);
    expect(r.mentions).toEqual([{ kind: "profile", handle: "ableg" }]);
  });

  it("leaves plain text without @ unchanged and emits no candidates", () => {
    const r = resolveComposeMentions("plain alice text", roster);
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

describe("composeHighlightSegments", () => {
  it("marks roster hits and Someone as tags", () => {
    expect(composeHighlightSegments("Hi @ableg and @Someone", roster)).toEqual([
      { type: "text", value: "Hi " },
      { type: "tag", value: "@ableg" },
      { type: "text", value: " and " },
      { type: "tag", value: "@Someone" },
    ]);
  });

  it("leaves unmatched @handles as plain text until resolve", () => {
    expect(composeHighlightSegments("Hi @nobody", roster)).toEqual([
      { type: "text", value: "Hi " },
      { type: "text", value: "@nobody" },
    ]);
  });
});

describe("typeahead helpers", () => {
  it("activeMentionQuery reads the @ fragment at caret", () => {
    expect(activeMentionQuery("hi @al", 6)).toEqual({ start: 3, query: "al" });
    expect(activeMentionQuery("hi @al ", 7)).toBeNull();
  });

  it("filterMentionRoster matches handle and display-name alias; caps at 6", () => {
    expect(filterMentionRoster(roster, "abl").map((e) => e.display)).toEqual(["ableg"]);
    expect(filterMentionRoster(roster, "alber").map((e) => e.display)).toEqual(["ableg"]);
    expect(MENTION_TYPEAHEAD_LIMIT).toBe(6);

    const many: MentionRoster = {
      personas: Array.from({ length: 10 }, (_, i) => ({
        label: `Persona${i}`,
        display: `Persona${i}`,
        candidate: { kind: "persona" as const, personaName: `Persona${i}` },
      })),
      profiles: [],
    };
    expect(filterMentionRoster(many, "Persona")).toHaveLength(6);
  });

  it("applyMentionSelection inserts handle (not display name) + space", () => {
    const next = applyMentionSelection("hi @Alb", 7, roster.profiles[0]!);
    expect(next.text).toBe("hi @ableg ");
    expect(next.caret).toBe("hi @ableg ".length);
  });
});
