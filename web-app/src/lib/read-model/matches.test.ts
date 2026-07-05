import { describe, expect, it } from "vitest";
import { JUR_DATA, POSTS } from "@/lib/mock";
import {
  ANON_VIEWER,
  type FeedFilterParams,
  type JurisdictionMembership,
  type ViewerContext,
} from "@/lib/types";
import { matches } from "./matches";

const RESIDENT: ViewerContext = {
  loggedIn: true,
  kycTier: 2,
  viewerDistricts: ["edmonton-strathcona"],
};

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

describe("matches — My Districts modes (feed)", () => {
  it("exclusive narrows: Global + my-district items only, refinements AND'd", () => {
    const results = POSTS.filter((p) =>
      matches(p, "feed", RESIDENT, {
        jurisdictions: ALL_SUBS,
        tierMin: 2,
        geography: { myDistricts: "exclusive", affected: "off" },
      }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(
        (p) =>
          p.jurisdiction === "Global" ||
          p.districts.includes("edmonton-strathcona"),
      ),
    ).toBe(true);
    // the Verified refinement still applies on top (tier-0 my-district post out)
    expect(results.every((p) => p.tier >= 2)).toBe(true);
    expect(results.some((p) => p.id === "stmt-jordan-bikelanes")).toBe(false);
  });

  it("inclusive broadens: my-district items are added past the refinements", () => {
    const tightened = POSTS.filter((p) =>
      matches(p, "feed", RESIDENT, { jurisdictions: ALL_SUBS, tierMin: 3 }),
    );
    expect(tightened.some((p) => p.id === "stmt-jordan-bikelanes")).toBe(false);

    const broadened = POSTS.filter((p) =>
      matches(p, "feed", RESIDENT, {
        jurisdictions: ALL_SUBS,
        tierMin: 3,
        geography: { myDistricts: "inclusive", affected: "off" },
      }),
    );
    // everything from the tightened set survives…
    expect(tightened.every((p) => broadened.includes(p))).toBe(true);
    // …plus my-district items that fail the Verified refinement (tier 0)
    expect(broadened.some((p) => p.id === "stmt-jordan-bikelanes")).toBe(true);
    expect(broadened.length).toBeGreaterThan(tightened.length);
  });

  it("exclusive pins the effective Verified floor to Residency (tierMin untouched)", () => {
    const results = POSTS.filter((p) =>
      matches(p, "feed", RESIDENT, {
        jurisdictions: ALL_SUBS,
        tierMin: 0, // remembered "Any" — the engaged exclusive pins it
        geography: { myDistricts: "exclusive", affected: "off" },
      }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.tier >= 2)).toBe(true);
  });

  it("inclusive never engages for a viewer without residency", () => {
    const results = POSTS.filter((p) =>
      matches(p, "feed", ANON_VIEWER, {
        jurisdictions: ALL_SUBS,
        tierMin: 3,
        geography: { myDistricts: "inclusive", affected: "off" },
      }),
    );
    expect(results.every((p) => p.tier >= 3)).toBe(true);
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

describe("matches — My Jurisdiction (author residence)", () => {
  const ALBERTA_ONLY: JurisdictionMembership[] = [
    { name: "Global", included: false },
    { name: "Alberta", included: true },
  ];
  const albertaSlugs = JUR_DATA.Alberta.districts.map((d) => d.slug);
  const jurFilter = (
    myJurisdiction: "inclusive" | "exclusive",
    tierMin: 0 | 1 | 2 | 3 = 0,
  ): FeedFilterParams => ({
    jurisdictions: ALBERTA_ONLY,
    tierMin,
    geography: {
      myDistricts: "off",
      affected: "off",
      myJurisdiction,
      jurisdictionDistricts: albertaSlugs,
    },
  });

  it("Only drops posts authored from outside the jurisdiction (viewer-independent)", () => {
    const results = POSTS.filter((p) =>
      matches(p, "feed", ANON_VIEWER, jurFilter("exclusive")),
    );
    expect(results.length).toBeGreaterThan(0);
    // sarahbc (Vancouver BC, tier 2, no modeled districts) authored this
    // Alberta petition — the whole point of the filter is to drop it.
    expect(results.some((p) => p.id === "pet-rural-broadband")).toBe(false);
    // district-less officials represent the jurisdiction and stay
    expect(results.some((p) => p.handle === "ableg")).toBe(true);
    // in-jurisdiction residents stay (Wei Chen, edmonton-strathcona)
    expect(results.some((p) => p.id === "pet-wei-path")).toBe(true);
  });

  it("Only pins the effective Verified floor to Residency", () => {
    const results = POSTS.filter((p) =>
      matches(p, "feed", ANON_VIEWER, jurFilter("exclusive", 0)),
    );
    expect(results.every((p) => p.tier >= 2)).toBe(true);
  });

  it("Include adds in-jurisdiction-authored posts past the refinements", () => {
    const tightened = POSTS.filter((p) =>
      matches(p, "feed", ANON_VIEWER, {
        jurisdictions: ALBERTA_ONLY,
        tierMin: 3,
      }),
    );
    expect(tightened.some((p) => p.id === "pet-wei-path")).toBe(false);

    const broadened = POSTS.filter((p) =>
      matches(p, "feed", ANON_VIEWER, jurFilter("inclusive", 3)),
    );
    expect(tightened.every((p) => broadened.includes(p))).toBe(true);
    expect(broadened.some((p) => p.id === "pet-wei-path")).toBe(true);
    // district-less residence is never a positive match
    expect(broadened.some((p) => p.id === "pet-rural-broadband")).toBe(false);
  });

  it("gates off without a district-slug universe (e.g. Global in the feed)", () => {
    const gatedOff: FeedFilterParams = {
      jurisdictions: ALBERTA_ONLY,
      geography: {
        myDistricts: "off",
        affected: "off",
        myJurisdiction: "exclusive",
        // no jurisdictionDistricts: a district-less jurisdiction is in scope
      },
    };
    const results = POSTS.filter((p) =>
      matches(p, "feed", ANON_VIEWER, gatedOff),
    );
    // no filtering AND no Residency pin — identical to no geography at all
    const baseline = POSTS.filter((p) =>
      matches(p, "feed", ANON_VIEWER, { jurisdictions: ALBERTA_ONLY }),
    );
    expect(results).toEqual(baseline);
  });

  it("applies on district scope too (posts about a district by outside authors drop)", () => {
    const broadbandDistrict = JUR_DATA.Alberta.districts[0].slug; // riding 0 is in the broadband petition
    const kept = POSTS.filter((p) =>
      matches(p, "district", ANON_VIEWER, {
        districtSlug: broadbandDistrict,
        tierMin: 0,
        geography: {
          myDistricts: "off",
          affected: "off",
          myJurisdiction: "exclusive",
          jurisdictionDistricts: albertaSlugs,
        },
      }),
    );
    expect(kept.some((p) => p.id === "pet-rural-broadband")).toBe(false);
    const unfiltered = POSTS.filter((p) =>
      matches(p, "district", ANON_VIEWER, { districtSlug: broadbandDistrict }),
    );
    expect(unfiltered.some((p) => p.id === "pet-rural-broadband")).toBe(true);
  });
});
