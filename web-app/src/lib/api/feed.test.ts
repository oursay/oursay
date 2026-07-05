import { describe, expect, it } from "vitest";
import { POSTS } from "@/lib/mock";
import { countCommentNodes } from "@/lib/mock/comment-utils";
import { listFeedItems } from "./feed";
import { getRecordDetail } from "./record";

describe("listFeedItems", () => {
  it("returns the full corpus for the default feed (Global + Alberta subscribed)", async () => {
    const items = await listFeedItems({});
    expect(items).toHaveLength(POSTS.length);
  });

  it("returns raw social counts (scaling is a display concern, not the API's)", async () => {
    const items = await listFeedItems({});
    const rae = items.find((p) => p.id === "stmt-rae-ravine");
    expect(rae?.up).toBe(204);
  });

  it("hides lower tiers as the Verified ladder rises but leaves counts raw", async () => {
    const items = await listFeedItems({ filter: { tierMin: 1 } });
    expect(items.every((p) => p.tier >= 1)).toBe(true);
    const rae = items.find((p) => p.id === "stmt-rae-ravine");
    expect(rae?.up).toBe(204);
  });

  it("includes the rural-broadband petition naming every third riding", async () => {
    const items = await listFeedItems({});
    const broadband = items.find((p) => p.id === "pet-rural-broadband");
    // Every third slug of the curated 12-riding demo set.
    expect(broadband?.districts.length).toBe(4);
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
