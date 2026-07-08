import { describe, expect, it } from "vitest";
import {
  kindToWireType,
  mapCommentNode,
  mapDistrictSummary,
  mapFeedItem,
  mapPersonaProfile,
  mapRecordDetail,
  tokenToTier,
  wireTypeToKind,
} from "./map";

describe("tokenToTier", () => {
  it("maps KYC tokens to numeric tiers", () => {
    expect(tokenToTier("unverified")).toBe(0);
    expect(tokenToTier("identity_verified")).toBe(1);
    expect(tokenToTier("residency_verified")).toBe(2);
    expect(tokenToTier("electoral_validated")).toBe(2);
  });

  it("maps official role to tier 3", () => {
    expect(tokenToTier("residency_verified", true)).toBe(3);
  });
});

describe("wire type mapping", () => {
  it("round-trips statement ↔ post", () => {
    expect(kindToWireType("statement")).toBe("post");
    expect(wireTypeToKind("post")).toBe("statement");
  });
});

describe("mapFeedItem", () => {
  it("maps appliesToDistrictIds to districts and type to kind", () => {
    const item = mapFeedItem({
      id: "x1",
      type: "post",
      jurisdiction: "ab-ca-gov",
      tier: "identity_verified",
      official: false,
      signTier: 1,
      appliesToDistrictIds: ["edmonton-strathcona"],
      author: "Jane",
      handle: "jane",
      identity: {
        display: "Jane",
        handle: "jane",
        isPersona: false,
        isSelf: false,
        seed: "jane",
        threadId: "x1",
      },
      authorGeo: "none",
      title: "Hello",
      body: ["para"],
      withheld: false,
      comments: 2,
      edits: 0,
      ts: "2026-01-01T00:00:00Z",
      up: 3,
      down: 1,
    });
    expect(item.kind).toBe("statement");
    expect(item.districts).toEqual(["edmonton-strathcona"]);
    expect(item.tier).toBe(1);
    expect(item.up).toBe(3);
  });

  it("strips leading @ from API handles", () => {
    const item = mapFeedItem({
      id: "x2",
      type: "post",
      jurisdiction: "ab-ca-gov",
      tier: "identity_verified",
      official: false,
      signTier: 1,
      appliesToDistrictIds: [],
      author: "Jane",
      handle: "@jane_alberta",
      identity: {
        display: "Jane",
        handle: "@jane_alberta",
        isPersona: false,
        isSelf: false,
        seed: "@jane_alberta",
        threadId: "x2",
      },
      authorGeo: "none",
      title: "Hi",
      body: [],
      withheld: false,
      comments: 0,
      edits: 0,
      ts: "2026-01-01T00:00:00Z",
    });
    expect(item.handle).toBe("jane_alberta");
    expect(item.identity?.handle).toBe("jane_alberta");
    expect(item.identity?.seed).toBe("jane_alberta");
  });
});

describe("mapRecordDetail", () => {
  it("sets interlink flags from wire ids", () => {
    const detail = mapRecordDetail({
      id: "poll-1",
      type: "poll",
      jurisdiction: "ab-ca-gov",
      tier: "residency_verified",
      official: false,
      signTier: 1,
      appliesToDistrictIds: [],
      author: "A",
      handle: "a",
      identity: {
        display: "A",
        handle: "a",
        isPersona: false,
        isSelf: false,
        seed: "a",
        threadId: "poll-1",
      },
      authorGeo: "none",
      title: "Budget",
      body: [],
      withheld: false,
      ts: "2026-01-01T00:00:00Z",
      edits: 0,
      sourcePetitionId: "pet-1",
      resultId: "res-1",
    });
    expect(detail.sourcePetition).toBe(true);
    expect(detail.resultPublished).toBe(true);
  });
});

describe("mapDistrictSummary", () => {
  it("uses seatHandle from the API when present", () => {
    const row = mapDistrictSummary(
      {
        name: "Edmonton-Strathcona",
        districtSlug: "edmonton-strathcona",
        leader: "Janis Irwin",
        seatHandle: "ab-edm_strth",
      },
      "ab-ca-gov",
    );
    expect(row.leaderHandle).toBe("ab-edm_strth");
    expect(row.leader).toBe("Janis Irwin");
  });

  it("derives the MLA seat handle when the list omits leaderHandle", () => {
    const row = mapDistrictSummary(
      {
        name: "Edmonton-Strathcona",
        districtSlug: "edmonton-strathcona",
      },
      "ab-ca-gov",
    );
    expect(row.leaderHandle).toBe("ab-edm_strth");
  });
});

describe("mapPersonaProfile", () => {
  it("includes root post reactions when the persona authored the thread", () => {
    const profile = mapPersonaProfile(
      {
        name: "SourCecilla77",
        threadId: "thread-1",
        isRootAuthor: true,
        tier: "identity_verified",
        comments: [
          {
            author: "SourCecilla77",
            handle: "SourCecilla77",
            tier: "identity_verified",
            authorGeo: "none",
            ts: "2026-01-01T00:00:00Z",
            edits: 0,
            signTier: 0,
            body: ["comment"],
            withheld: false,
            up: 1,
            down: 1,
            identity: {
              display: "SourCecilla77",
              handle: null,
              isPersona: true,
              isSelf: false,
              seed: "SourCecilla77",
              threadId: "thread-1",
            },
            replies: [],
          },
        ],
      },
      "statement",
      "My statement",
      { up: 5, down: 0 },
    );
    expect(profile.support).toEqual({
      agrees: 6,
      disagrees: 1,
      statements: 0,
      comments: 1,
    });
  });

  it("ignores root post reactions when the persona only commented", () => {
    const profile = mapPersonaProfile(
      {
        name: "Commenter77",
        threadId: "thread-1",
        isRootAuthor: false,
        tier: "identity_verified",
        comments: [
          {
            author: "Commenter77",
            handle: "Commenter77",
            tier: "identity_verified",
            authorGeo: "none",
            ts: "2026-01-01T00:00:00Z",
            edits: 0,
            signTier: 0,
            body: ["comment"],
            withheld: false,
            up: 1,
            down: 1,
            identity: {
              display: "Commenter77",
              handle: null,
              isPersona: true,
              isSelf: false,
              seed: "Commenter77",
              threadId: "thread-1",
            },
            replies: [],
          },
        ],
      },
      "statement",
      "Someone else's statement",
      { up: 5, down: 0 },
    );
    expect(profile.support).toEqual({
      agrees: 1,
      disagrees: 1,
      statements: 0,
      comments: 1,
    });
  });
});

describe("mapCommentNode", () => {
  it("maps nested replies recursively", () => {
    const node = mapCommentNode({
      author: "p1",
      handle: "p1",
      tier: "unverified",
      authorGeo: "none",
      ts: "2026-01-01T00:00:00Z",
      edits: 0,
      signTier: 0,
      body: ["hi"],
      withheld: false,
      up: 1,
      down: 0,
      identity: {
        display: "p1",
        handle: null,
        isPersona: true,
        isSelf: false,
        seed: "p1",
        threadId: "t1",
      },
      replies: [
        {
          author: "p2",
          handle: "p2",
          tier: "unverified",
          authorGeo: "none",
          ts: "2026-01-02T00:00:00Z",
          edits: 0,
          signTier: 0,
          body: ["reply"],
          withheld: false,
          up: 0,
          down: 0,
          identity: {
            display: "p2",
            handle: null,
            isPersona: true,
            isSelf: false,
            seed: "p2",
            threadId: "t1",
          },
          replies: [],
        },
      ],
    });
    expect(node.replies).toHaveLength(1);
    expect(node.replies[0].body).toEqual(["reply"]);
  });

  it("maps official flag to tier 3", () => {
    const node = mapCommentNode({
      author: "Alberta Assembly",
      handle: "ableg",
      tier: "residency_verified",
      official: true,
      authorGeo: "jurisdiction",
      ts: "2026-01-01T00:00:00Z",
      edits: 0,
      signTier: 0,
      body: ["official comment"],
      up: 0,
      down: 0,
      identity: {
        display: "Alberta Assembly",
        handle: "ableg",
        isPersona: false,
        isSelf: false,
        seed: "ableg",
        threadId: "t1",
      },
      replies: [],
    });
    expect(node.tier).toBe(3);
  });
});
