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

describe("matches — Signed filter ladder (inclusive-upward)", () => {
  it("Passkey keeps signTier >= 1", () => {
    const passkeyUp = feed({ jurisdictions: ALL_SUBS, signedFilter: 1 });
    expect(passkeyUp.length).toBeGreaterThan(0);
    expect(passkeyUp.every((p) => (p.signTier ?? 0) >= 1)).toBe(true);
  });

  it("Biometric keeps signTier >= 2 only", () => {
    const biometricUp = feed({ jurisdictions: ALL_SUBS, signedFilter: 2 });
    expect(biometricUp.every((p) => (p.signTier ?? 0) >= 2)).toBe(true);
    expect(biometricUp.some((p) => p.id === "poll-ableg-budget")).toBe(true);
    expect(biometricUp.some((p) => p.signTier === 1)).toBe(false);
  });

  it("Any keeps all items when signedFilter is 0 or omitted", () => {
    expect(feed({ jurisdictions: ALL_SUBS, signedFilter: 0 })).toHaveLength(
      POSTS.length,
    );
    expect(feed({ jurisdictions: ALL_SUBS })).toHaveLength(POSTS.length);
  });

  it("combines signedFilter with tierMin (AND)", () => {
    const both = feed({
      jurisdictions: ALL_SUBS,
      signedFilter: 1,
      tierMin: 2,
    });
    expect(both.every((p) => p.tier >= 2 && (p.signTier ?? 0) >= 1)).toBe(true);
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
