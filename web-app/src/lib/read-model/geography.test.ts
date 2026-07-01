import { describe, expect, it } from "vitest";
import type { FeedFilterParams, ViewerContext } from "@/lib/types";
import {
  geographyKeep,
  postQualifiesForAffected,
} from "./geography";

const RESIDENT: ViewerContext = {
  loggedIn: true,
  kycTier: 2,
  viewerDistricts: ["edmonton-strathcona"],
};

const mine = { districts: ["edmonton-strathcona"] };
const otherRiding = { districts: ["calgary-elbow"] };
const namedOther = { districts: ["edmonton-city-centre"] };
const official = { districts: [] as string[] };

// A multi-district post (Wei Chen's) — qualifies for Affected.
const openMultiPost = {
  districts: ["edmonton-strathcona", "edmonton-city-centre"],
};

describe("postQualifiesForAffected", () => {
  it("qualifies jurisdiction-wide and multi-district posts only", () => {
    expect(postQualifiesForAffected({ districts: [] })).toBe(true);
    expect(postQualifiesForAffected(openMultiPost)).toBe(true);
    expect(postQualifiesForAffected(mine)).toBe(false); // single-district
  });
});

describe("geographyKeep — My Districts", () => {
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: { myDistricts: true, affected: false },
  };

  it("keeps my riding and district-less (official) authors, drops others", () => {
    expect(geographyKeep(mine, [], RESIDENT, filter)).toBe(true);
    expect(geographyKeep(official, [], RESIDENT, filter)).toBe(true);
    expect(geographyKeep(otherRiding, [], RESIDENT, filter)).toBe(false);
  });

  it("disengages when districts aren't inferable (tierMin < 2)", () => {
    const belowResidency: FeedFilterParams = {
      tierMin: 1,
      geography: { myDistricts: true, affected: false },
    };
    // filter is not applied, so an other-riding author is still kept
    expect(geographyKeep(otherRiding, [], RESIDENT, belowResidency)).toBe(true);
  });
});

describe("geographyKeep — Affected (post-detail only)", () => {
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: { myDistricts: false, affected: true },
  };

  it("does not engage without post-detail context (list paths)", () => {
    // No openPost -> Affected off -> nothing filtered
    expect(geographyKeep(otherRiding, [], RESIDENT, filter)).toBe(true);
  });

  it("keeps residents of the post's other named districts", () => {
    const postDistricts = openMultiPost.districts;
    expect(
      geographyKeep(namedOther, postDistricts, RESIDENT, filter, openMultiPost),
    ).toBe(true);
    // a riding not named by the post is dropped
    expect(
      geographyKeep(otherRiding, postDistricts, RESIDENT, filter, openMultiPost),
    ).toBe(false);
  });
});

describe("geographyKeep — My Districts OR Affected", () => {
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: { myDistricts: true, affected: true },
  };
  const postDistricts = openMultiPost.districts;

  it("keeps either my riding or the post's other named districts", () => {
    expect(
      geographyKeep(mine, postDistricts, RESIDENT, filter, openMultiPost),
    ).toBe(true); // via My Districts
    expect(
      geographyKeep(namedOther, postDistricts, RESIDENT, filter, openMultiPost),
    ).toBe(true); // via Affected
    expect(
      geographyKeep(otherRiding, postDistricts, RESIDENT, filter, openMultiPost),
    ).toBe(false); // neither
  });
});
