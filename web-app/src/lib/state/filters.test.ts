import { describe, expect, it } from "vitest";
import { JUR_DATA } from "@/lib/mock";
import type { AppState } from "./types";
import { INITIAL_APP_STATE } from "./AppProvider";
import { feedFilterFromState, scopedFeedFilterFromState } from "./filters";

const ALBERTA_SLUGS = JUR_DATA.Alberta.districts.map((d) => d.slug);

function state(patch: Partial<AppState>): AppState {
  return { ...INITIAL_APP_STATE, ...patch };
}

describe("feedFilterFromState — fetch-path filter", () => {
  it("is independent of pageJurisdiction (regression: Post-view refetch/flicker loop)", () => {
    // PostView writes pageJurisdiction after loading while fetching with this
    // filter — if the filter read it, every load would invalidate its own
    // fetch and oscillate between "Record not found" and the post.
    const off = feedFilterFromState(state({ pageJurisdiction: null }));
    const on = feedFilterFromState(state({ pageJurisdiction: "Alberta" }));
    expect(on).toEqual(off);
  });

  it("never sends the district universe — the API resolves it per scope", () => {
    const filter = feedFilterFromState(state({ myJurisdiction: "exclusive" }));
    expect(filter.geography?.jurisdictionDistricts).toBeUndefined();
    expect(filter.geography?.myJurisdiction).toBe("exclusive");
  });
});

describe("scopedFeedFilterFromState — chrome-only district universe", () => {
  it("an open view's jurisdiction pins the universe", () => {
    const filter = scopedFeedFilterFromState(state({ pageJurisdiction: "Alberta" }));
    expect(filter.geography?.jurisdictionDistricts).toEqual(ALBERTA_SLUGS);
  });

  it("feed scope unions the included subscriptions", () => {
    const filter = scopedFeedFilterFromState(
      state({
        pageJurisdiction: null,
        subscriptions: [
          { name: "Global", included: false },
          { name: "Alberta", included: true },
        ],
      }),
    );
    expect(filter.geography?.jurisdictionDistricts).toEqual(ALBERTA_SLUGS);
  });

  it("a district-less jurisdiction in scope leaves the universe unresolved (filter gates off)", () => {
    const filter = scopedFeedFilterFromState(
      state({
        pageJurisdiction: null,
        subscriptions: [
          { name: "Global", included: true },
          { name: "Alberta", included: true },
        ],
      }),
    );
    expect(filter.geography?.jurisdictionDistricts).toBeUndefined();
    expect(
      scopedFeedFilterFromState(state({ pageJurisdiction: "Global" })).geography
        ?.jurisdictionDistricts,
    ).toBeUndefined();
  });
});
