import { describe, expect, it } from "vitest";
import { POSTS } from "@/lib/mock";
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
    // Rae Nguyen is Official (tier 3) so she survives; her counts stay raw —
    // the card layer thins the displayed reaction counts via scaleSocial (§4.3).
    const rae = items.find((p) => p.id === "stmt-rae-ravine");
    expect(rae?.up).toBe(204);
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
