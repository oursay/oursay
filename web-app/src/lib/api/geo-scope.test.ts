import { describe, expect, it } from "vitest";
import { ANON_VIEWER, type FeedFilterParams } from "@/lib/types";
import { listFeedItems } from "./feed";
import { getRecordDetail } from "./record";

// The client never sends geography.jurisdictionDistricts — these tests prove
// the API resolves the universe from its own scope (see geo-scope.ts).
const jurOnly: FeedFilterParams = {
  geography: { myDistricts: "off", affected: "off", myJurisdiction: "exclusive" },
};

describe("API-resolved My Jurisdiction universe", () => {
  it("feed scope: resolves from the included subscriptions", async () => {
    const rows = await listFeedItems({
      scope: "feed",
      viewer: ANON_VIEWER,
      filter: {
        ...jurOnly,
        jurisdictions: [
          { name: "Global", included: false },
          { name: "Alberta", included: true },
        ],
      },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((p) => p.id === "pet-rural-broadband")).toBe(false); // BC author
    expect(rows.some((p) => p.id === "pet-wei-path")).toBe(true); // Alberta author
  });

  it("feed scope: Global included -> universe unresolved -> filter gated off", async () => {
    const rows = await listFeedItems({
      scope: "feed",
      viewer: ANON_VIEWER,
      filter: {
        ...jurOnly,
        jurisdictions: [
          { name: "Global", included: true },
          { name: "Alberta", included: true },
        ],
      },
    });
    expect(rows.some((p) => p.id === "pet-rural-broadband")).toBe(true);
  });

  it("jurisdiction scope: resolves from the pinned jurisdiction", async () => {
    const rows = await listFeedItems({
      scope: "jurisdiction",
      viewer: ANON_VIEWER,
      filter: { ...jurOnly, jurisdiction: "Alberta" },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((p) => p.id === "pet-rural-broadband")).toBe(false);
  });

  it("post detail: resolves from the post's own jurisdiction", async () => {
    // id-verified viewer so Sarah's identity is revealed when she IS served —
    // otherwise the "dropped" assertion would pass vacuously via her persona.
    const idViewer = { loggedIn: true, kycTier: 1 as const, viewerDistricts: [] };
    const unfiltered = await getRecordDetail("pet-wei-path", { viewer: idViewer });
    expect(unfiltered!.comments.map((c) => c.author)).toContain("Sarah Okamoto");

    const filtered = await getRecordDetail("pet-wei-path", {
      viewer: idViewer,
      filter: jurOnly,
    });
    const authors = filtered!.comments.map((c) => c.author);
    expect(authors).toContain("Bea Nowak"); // calgary-elbow: in jurisdiction
    expect(authors).not.toContain("Sarah Okamoto"); // BC: dropped
  });
});
