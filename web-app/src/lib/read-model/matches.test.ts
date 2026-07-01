import { describe, expect, it } from "vitest";
import { POSTS } from "@/lib/mock";
import {
  ANON_VIEWER,
  type FeedFilterParams,
  type JurisdictionMembership,
} from "@/lib/types";
import { matches } from "./matches";

const ALL_SUBS: JurisdictionMembership[] = [
  { name: "Global", included: true },
  { name: "Alberta", included: true },
];

function feed(filter: FeedFilterParams) {
  return POSTS.filter((p) => matches(p, "feed", ANON_VIEWER, filter));
}

describe("matches — record-type include", () => {
  it("keeps only included kinds", () => {
    const petitions = feed({ jurisdictions: ALL_SUBS, types: ["petition"] });
    expect(petitions.length).toBeGreaterThan(0);
    expect(petitions.every((p) => p.kind === "petition")).toBe(true);
  });

  it("keeps all kinds when types is undefined", () => {
    expect(feed({ jurisdictions: ALL_SUBS })).toHaveLength(POSTS.length);
  });
});

describe("matches — Verified ladder (inclusive-upward)", () => {
  it("an Official filter hides residents (tier < 3)", () => {
    const officialOnly = feed({ jurisdictions: ALL_SUBS, tierMin: 3 });
    expect(officialOnly.every((p) => p.tier === 3)).toBe(true);
    expect(officialOnly.some((p) => p.tier === 2)).toBe(false);
  });

  it("an ID filter still shows Residency and Official authors", () => {
    const idAndUp = feed({ jurisdictions: ALL_SUBS, tierMin: 1 });
    expect(idAndUp.every((p) => p.tier >= 1)).toBe(true);
    expect(idAndUp.some((p) => p.tier === 3)).toBe(true);
  });
});

describe("matches — jurisdiction filter", () => {
  it("feed excludes de-selected subscriptions", () => {
    const globalOnly = feed({
      jurisdictions: [
        { name: "Global", included: true },
        { name: "Alberta", included: false },
      ],
    });
    expect(globalOnly.every((p) => p.jurisdiction === "Global")).toBe(true);
  });
});

describe("matches — district scope", () => {
  it("keeps posts that apply to the district (incl. multi-district)", () => {
    const inStrathcona = POSTS.filter((p) =>
      matches(p, "district", ANON_VIEWER, {
        districtSlug: "edmonton-strathcona",
      }),
    );
    expect(inStrathcona.length).toBeGreaterThan(0);
    expect(
      inStrathcona.every((p) => p.districts.includes("edmonton-strathcona")),
    ).toBe(true);
    // the Wei Chen petition is multi-district and must be included
    expect(inStrathcona.some((p) => p.id === "pet-wei-path")).toBe(true);
  });
});
