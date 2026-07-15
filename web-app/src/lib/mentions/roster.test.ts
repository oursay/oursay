import { describe, expect, it } from "vitest";
import { mentionRosterForNewThread, mentionRosterFromThread } from "./roster";
import type { CommentNode, RecordDetail } from "@/lib/types";

describe("mentionRosterFromThread", () => {
  it("collects personas and revealed profiles from root + comments", () => {
    const detail = {
      author: "Root",
      handle: "root_user",
      identity: {
        display: "Root",
        handle: "root_user",
        isPersona: false,
        isSelf: false,
        seed: "root_user",
        threadId: "t1",
      },
    } as Pick<RecordDetail, "author" | "handle" | "identity">;

    const comments: CommentNode[] = [
      {
        author: "CuriousFox12",
        handle: "CuriousFox12",
        tier: 0,
        ts: "2026-01-01T00:00:00.000Z",
        body: ["hi"],
        up: 0,
        down: 0,
        identity: {
          display: "CuriousFox12",
          handle: null,
          isPersona: true,
          isSelf: false,
          seed: "CuriousFox12",
          threadId: "t1",
        },
        replies: [],
      },
    ];

    const roster = mentionRosterFromThread(detail, comments);
    expect(roster.profiles.map((p) => p.label)).toContain("root_user");
    expect(roster.profiles.find((p) => p.label === "root_user")?.display).toBe("root_user");
    expect(roster.profiles.find((p) => p.label === "root_user")?.aliases).toContain("Root");
    expect(roster.personas.map((p) => p.label)).toContain("CuriousFox12");
  });

  it("profile display stays the handle even when author is a display name", () => {
    const detail = {
      author: "Alberta Legislature",
      handle: "ableg",
      identity: {
        display: "Alberta Legislature",
        handle: "ableg",
        isPersona: false,
        isSelf: false,
        seed: "ableg",
        threadId: "t1",
      },
    } as Pick<RecordDetail, "author" | "handle" | "identity">;

    const roster = mentionRosterFromThread(detail, []);
    const entry = roster.profiles.find((p) => p.label === "ableg");
    expect(entry?.display).toBe("ableg");
    expect(entry?.aliases).toContain("Alberta Legislature");
  });
});

describe("mentionRosterForNewThread", () => {
  it("seeds the signed-in profile for self-@ on new posts", () => {
    const roster = mentionRosterForNewThread({
      handle: "alex_morgan",
      displayName: "Alex Morgan",
    });
    expect(roster.personas).toHaveLength(0);
    expect(roster.profiles).toHaveLength(1);
    expect(roster.profiles[0]?.display).toBe("alex_morgan");
    expect(roster.profiles[0]?.aliases).toContain("Alex Morgan");
  });

  it("returns empty when no handle is available", () => {
    expect(mentionRosterForNewThread({}).profiles).toHaveLength(0);
    expect(mentionRosterForNewThread({ handle: "  " }).profiles).toHaveLength(0);
  });
});
