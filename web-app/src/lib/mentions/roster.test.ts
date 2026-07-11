import { describe, expect, it } from "vitest";
import { mentionRosterFromThread } from "./roster";
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
    expect(roster.personas.map((p) => p.label)).toContain("CuriousFox12");
  });
});
