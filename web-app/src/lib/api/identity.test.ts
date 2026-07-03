import { describe, expect, it } from "vitest";
import { MY_HANDLE, MY_NAME } from "@/lib/mock";
import type {
  CommentNode,
  FeedItem,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";
import { anonymizeFeedItem, personaFor, personaMapForThread } from "./identity";
import { getRecordDetail } from "./record";
import { listFeedItems } from "./feed";

const MY = ["edmonton-strathcona"];

function viewer(kycTier: VerificationTier, extra: Partial<ViewerContext> = {}): ViewerContext {
  return {
    loggedIn: kycTier > 0,
    kycTier,
    viewerDistricts: kycTier >= 2 ? MY : [],
    ...extra,
  };
}

function item(handle: string, author: string, id = "stmt-x"): FeedItem {
  return {
    id,
    kind: "statement",
    jurisdiction: "Alberta",
    tier: 1,
    districts: [],
    author,
    handle,
    title: "t",
    body: [],
    comments: 0,
  };
}

const PERSONA_SHAPE = /^[A-Z][A-Za-z]+\d{2,}$/;

describe("anonymizeFeedItem — reveal waves by viewer tier", () => {
  it("pshah (my_district, calgary-elbow) stays a persona at every tier for our viewer", () => {
    for (const t of [0, 1, 2, 3] as const) {
      const out = anonymizeFeedItem(item("pshah", "Priti Shah"), viewer(t));
      expect(out.identity?.isPersona).toBe(true);
      expect(out.author).toMatch(PERSONA_SHAPE);
      expect(out.handle).toBe(out.author);
      expect(out.identity?.handle).toBeNull();
    }
  });

  it("priya (id_verified) reveals at tier 1", () => {
    expect(anonymizeFeedItem(item("priya", "Priya Anand"), viewer(0)).identity?.isPersona).toBe(true);
    const revealed = anonymizeFeedItem(item("priya", "Priya Anand"), viewer(1));
    expect(revealed.identity?.isPersona).toBe(false);
    expect(revealed.author).toBe("Priya Anand");
    expect(revealed.handle).toBe("priya");
  });

  it("jvance (my_district, viewer's riding) reveals at tier 2", () => {
    expect(anonymizeFeedItem(item("jvance", "Jordan Vance"), viewer(1)).identity?.isPersona).toBe(true);
    expect(anonymizeFeedItem(item("jvance", "Jordan Vance"), viewer(2)).identity?.isPersona).toBe(false);
  });

  it("samd (all_officials) reveals at tier 3 — except on his narrowed thread", () => {
    expect(anonymizeFeedItem(item("samd", "Sam Driver"), viewer(2)).identity?.isPersona).toBe(true);
    expect(anonymizeFeedItem(item("samd", "Sam Driver"), viewer(3)).identity?.isPersona).toBe(false);
    // Thread override pet-sam-109st -> anonymous (narrow beats account).
    const onOwnThread = anonymizeFeedItem(
      item("samd", "Sam Driver", "pet-sam-109st"),
      viewer(3),
    );
    expect(onOwnThread.identity?.isPersona).toBe(true);
  });

  it("rosak (my_officials, calgary-elbow) stays a persona even for a tier-3 viewer", () => {
    expect(anonymizeFeedItem(item("rosak", "Rosa Klein"), viewer(3)).identity?.isPersona).toBe(true);
  });

  it("dwhitecloud's widening thread override is ignored (anonymous stands)", () => {
    const out = anonymizeFeedItem(
      item("dwhitecloud", "Dana Whitecloud", "stmt-dana-transit"),
      viewer(3),
    );
    expect(out.identity?.isPersona).toBe(true);
  });

  it("public authors reveal to logged-out viewers", () => {
    const out = anonymizeFeedItem(item("hanao", "Hana Okafor"), viewer(0));
    expect(out.identity?.isPersona).toBe(false);
    expect(out.author).toBe("Hana Okafor");
  });
});

describe("self identity", () => {
  it("the viewer always sees their own content revealed", () => {
    const out = anonymizeFeedItem(
      item(MY_HANDLE, MY_NAME),
      viewer(0, { loggedIn: true, selfHandle: MY_HANDLE, selfVisibility: "anonymous" }),
    );
    expect(out.author).toBe(MY_NAME);
    expect(out.identity?.isSelf).toBe(true);
    expect(out.identity?.isPersona).toBe(false);
  });

  it("hints the persona others see when own visibility is not public", () => {
    const masked = anonymizeFeedItem(
      item(MY_HANDLE, MY_NAME),
      viewer(2, { selfHandle: MY_HANDLE, selfVisibility: "my_district" }),
    );
    expect(masked.identity?.seenByOthersAs).toMatch(PERSONA_SHAPE);

    const open = anonymizeFeedItem(
      item(MY_HANDLE, MY_NAME),
      viewer(2, { selfHandle: MY_HANDLE, selfVisibility: "public" }),
    );
    expect(open.identity?.seenByOthersAs).toBeUndefined();
  });
});

describe("persona stability across surfaces", () => {
  it("feed card and detail page use the same persona per (author, thread)", async () => {
    const anon = viewer(0);
    const feed = await listFeedItems({ viewer: anon });
    const card = feed.find((f) => f.id === "pet-sam-109st");
    expect(card).toBeDefined();
    expect(card!.identity?.isPersona).toBe(true);
    expect(card!.author).toBe(personaFor("samd", "pet-sam-109st"));

    const detail = await getRecordDetail("pet-sam-109st", { viewer: anon });
    expect(detail!.detail.author).toBe(card!.author);
  });

  it("the same author gets different personas on different threads", () => {
    expect(personaFor("pshah", "stmt-a")).not.toBe(personaFor("pshah", "stmt-b"));
  });

  it("masks comment authors while keeping civic signals (tier, districts)", async () => {
    const entry = await getRecordDetail("pet-sam-109st", { viewer: viewer(0) });
    const walk = (nodes: CommentNode[]): void => {
      for (const node of nodes) {
        expect(node.identity).toBeDefined();
        if (node.identity!.isPersona) {
          expect(node.author).toMatch(PERSONA_SHAPE);
          expect(node.identity!.handle).toBeNull();
        }
        // Tier + districts stay regardless of masking (civic signal, not identity).
        expect(node.tier).toBeGreaterThanOrEqual(0);
        walk(node.replies);
      }
    };
    expect(entry!.comments.length).toBeGreaterThan(0);
    walk(entry!.comments);
  });

  it("assigns unique persona names across a thread's roster", () => {
    const map = personaMapForThread("pet-sam-109st");
    expect(map.size).toBeGreaterThan(1);
    expect(new Set(map.values()).size).toBe(map.size);
  });
});
