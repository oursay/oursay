import { describe, expect, it } from "vitest";
import { POSTS } from "@/lib/mock";
import { countCommentNodes } from "@/lib/mock/comment-utils";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";
import { listAllFeedItems, listFeedItems } from "./feed";
import { getRecordDetail } from "./record";

/** Explicit both-included filter — default membership is Alberta-selected only. */
const BOTH_INCLUDED = {
  jurisdictions: [
    { id: GLOBAL_ID, included: true },
    { id: ALBERTA_ID, included: true },
  ],
};

describe("listFeedItems", () => {
  it("returns Alberta-scoped items on the default membership (Alberta selected)", async () => {
    const items = await listAllFeedItems({});
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((p) => p.jurisdiction === ALBERTA_ID)).toBe(true);
  });

  it("returns the full corpus when Global + Alberta are both included", async () => {
    const items = await listAllFeedItems({ filter: BOTH_INCLUDED });
    expect(items).toHaveLength(POSTS.length);
  });

  it("returns raw social counts (scaling is a display concern, not the API's)", async () => {
    const items = await listAllFeedItems({ filter: BOTH_INCLUDED });
    const rae = items.find((p) => p.id === "stmt-rae-ravine");
    expect(rae?.up).toBe(204);
  });

  it("hides lower tiers as the Verified ladder rises but leaves counts raw", async () => {
    const items = await listAllFeedItems({ filter: { ...BOTH_INCLUDED, tierMin: 1 } });
    expect(items.every((p) => p.tier >= 1)).toBe(true);
    const rae = items.find((p) => p.id === "stmt-rae-ravine");
    expect(rae?.up).toBe(204);
  });

  it("includes the rural-broadband petition naming every third riding", async () => {
    const items = await listAllFeedItems({ filter: BOTH_INCLUDED });
    const broadband = items.find((p) => p.id === "pet-rural-broadband");
    // Every third slug of the curated 12-riding demo set.
    expect(broadband?.districts.length).toBe(4);
  });

  it("returns pages of 25 with a cursor in mock mode", async () => {
    expect(POSTS.length).toBeGreaterThan(25);

    const page1 = await listFeedItems({ filter: BOTH_INCLUDED });
    expect(page1.items.length).toBe(25);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.total).toBe(POSTS.length);

    const page2 = await listFeedItems({
      filter: BOTH_INCLUDED,
      cursor: page1.nextCursor,
    });
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page1.items[0]?.id).not.toBe(page2.items[0]?.id);
    expect(page2.total).toBe(POSTS.length);
  });
});

describe("getRecordDetail", () => {
  it("returns the detail and comment thread for a known record", async () => {
    const result = await getRecordDetail("stmt-hana-ravine");
    expect(result).not.toBeNull();
    expect(result!.detail.id).toBe("stmt-hana-ravine");
    expect(result!.detail.title).toBe("Protect the Whitemud Creek ravine");
    expect(result!.comments.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown id", async () => {
    const result = await getRecordDetail("no-such-id");
    expect(result).toBeNull();
  });

  it("syncs feed comment counts from the comment tree", async () => {
    const item = POSTS.find((p) => p.id === "stmt-hana-ravine");
    const result = await getRecordDetail("stmt-hana-ravine");
    expect(item?.comments).toBe(countCommentNodes(result!.comments));
  });
});
