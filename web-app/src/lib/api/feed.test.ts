import { describe, expect, it } from "vitest";
import { POSTS } from "@/lib/mock";
import { listFeedItems } from "./feed";
import { getRecordDetail } from "./record";

describe("listFeedItems", () => {
  it("returns the full corpus for the default feed (Global + Alberta subscribed)", async () => {
    const items = await listFeedItems({});
    expect(items).toHaveLength(POSTS.length);
  });

  it("leaves social counts unscaled at tier None", async () => {
    const items = await listFeedItems({});
    const rae = items.find((p) => p.id === "stmt-rae-ravine");
    expect(rae?.up).toBe(204);
  });

  it("thins social counts and hides lower tiers as the ladder rises", async () => {
    const items = await listFeedItems({ filter: { tierMin: 1 } });
    expect(items.every((p) => p.tier >= 1)).toBe(true);
    // Rae Nguyen is Official (tier 3) so she survives; her 204 agrees thin to 126.
    const rae = items.find((p) => p.id === "stmt-rae-ravine");
    expect(rae?.up).toBe(126);
  });
});

describe("getRecordDetail", () => {
  it("returns the detail and comment thread for a known record", async () => {
    const { detail, comments } = await getRecordDetail(
      "stmt-hana-ravine",
      "statement",
    );
    expect(detail.id).toBe("stmt-hana-ravine");
    expect(detail.title).toBe("Protect the Whitemud Creek ravine");
    expect(comments.length).toBeGreaterThan(0);
  });

  it("falls back to the representative sample for an unknown id", async () => {
    const { detail } = await getRecordDetail("no-such-id", "poll");
    expect(detail.kind).toBe("poll");
  });
});
