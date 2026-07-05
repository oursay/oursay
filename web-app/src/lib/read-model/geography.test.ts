import { describe, expect, it } from "vitest";
import type { FeedFilterParams, ViewerContext } from "@/lib/types";
import {
  authorGeoRelation,
  effectiveMyJurisdiction,
  geographyKeep,
  isJurisdictionKeep,
  jurisdictionWidePost,
  pinnedTierMin,
  resolveGeography,
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

// A multi-district post (Wei Chen's) — affects mine and one other riding.
const openMultiPost = {
  districts: ["edmonton-strathcona", "edmonton-city-centre"],
};
// A post naming none of my ridings — the exclusive-conflict case.
const openOutsidePost = {
  districts: ["calgary-elbow", "edmonton-city-centre"],
};
// A post that only relates to my own riding — the interlock case.
const openMinePost = { districts: ["edmonton-strathcona"] };

describe("geographyKeep — My Districts exclusive (narrow)", () => {
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: { myDistricts: "exclusive", affected: "off" },
  };

  it("keeps my riding and district-less (official) authors, drops others", () => {
    expect(geographyKeep(mine, [], RESIDENT, filter, true)).toBe(true);
    expect(geographyKeep(official, [], RESIDENT, filter, true)).toBe(true);
    expect(geographyKeep(otherRiding, [], RESIDENT, filter, true)).toBe(false);
  });

  it("still drops nodes failing the refinements (AND)", () => {
    expect(geographyKeep(mine, [], RESIDENT, filter, false)).toBe(false);
  });

  it("pins the effective Verified floor to Residency (state untouched)", () => {
    const geo = resolveGeography(filter, RESIDENT);
    expect(pinnedTierMin(0, geo)).toBe(2);
    expect(pinnedTierMin(3, geo)).toBe(3); // never lowers
    const inclusiveGeo = resolveGeography(
      { geography: { myDistricts: "inclusive", affected: "off" } },
      RESIDENT,
    );
    expect(pinnedTierMin(0, inclusiveGeo)).toBe(0); // inclusive doesn't pin
  });
});

describe("geographyKeep — My Districts inclusive (broaden)", () => {
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: { myDistricts: "inclusive", affected: "off" },
  };

  it("adds my-riding nodes even when they fail the refinements", () => {
    expect(geographyKeep(mine, [], RESIDENT, filter, false)).toBe(true);
  });

  it("does not drop anything: non-matches fall back to the refinements", () => {
    expect(geographyKeep(otherRiding, [], RESIDENT, filter, true)).toBe(true);
    expect(geographyKeep(otherRiding, [], RESIDENT, filter, false)).toBe(false);
  });

  it("engages at any Verified level (no Residency+ coupling)", () => {
    const anyTier: FeedFilterParams = {
      tierMin: 0,
      geography: { myDistricts: "inclusive", affected: "off" },
    };
    expect(geographyKeep(mine, [], RESIDENT, anyTier, false)).toBe(true);
  });

  it("does not treat district-less nodes as positive matches", () => {
    expect(geographyKeep(official, [], RESIDENT, filter, false)).toBe(false);
  });
});

describe("geographyKeep — Affected (post-detail only)", () => {
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: { myDistricts: "off", affected: "exclusive" },
  };

  it("does not engage without post-detail context (list paths)", () => {
    // No openPost -> Affected off -> nothing filtered
    expect(geographyKeep(otherRiding, [], RESIDENT, filter, true)).toBe(true);
  });

  it("exclusive keeps residents of the post's affected districts, mine included", () => {
    const postDs = openMultiPost.districts;
    expect(
      geographyKeep(namedOther, postDs, RESIDENT, filter, true, openMultiPost),
    ).toBe(true);
    expect(
      geographyKeep(mine, postDs, RESIDENT, filter, true, openMultiPost),
    ).toBe(true); // my riding is one of the affected districts
    // a riding not named by the post is dropped
    expect(
      geographyKeep(otherRiding, postDs, RESIDENT, filter, true, openMultiPost),
    ).toBe(false);
  });

  it("works on a single-district post outside my area", () => {
    const openSinglePost = { districts: ["calgary-elbow"] };
    const postDs = openSinglePost.districts;
    expect(
      geographyKeep(otherRiding, postDs, RESIDENT, filter, true, openSinglePost),
    ).toBe(true); // the affected resident
    expect(
      geographyKeep(namedOther, postDs, RESIDENT, filter, true, openSinglePost),
    ).toBe(false); // unrelated riding
  });

  it("inclusive adds affected-district residents past the refinements", () => {
    const inclusive: FeedFilterParams = {
      tierMin: 2,
      geography: { myDistricts: "off", affected: "inclusive" },
    };
    const postDs = openMultiPost.districts;
    expect(
      geographyKeep(
        namedOther,
        postDs,
        RESIDENT,
        inclusive,
        false,
        openMultiPost,
      ),
    ).toBe(true);
    // district-less nodes are not positive matches — refinements decide
    expect(
      geographyKeep(official, postDs, RESIDENT, inclusive, false, openMultiPost),
    ).toBe(false);
  });
});

describe("geographyKeep — Affected: Only + My Districts: Include (outside post)", () => {
  // The headline case: on a post outside my area, filter to only the affected
  // residents AND add people from my district.
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: {
      myDistricts: "inclusive",
      affected: "exclusive",
      priority: "affected",
    },
  };
  const postDs = openOutsidePost.districts;

  it("keeps affected residents, adds mine, drops unrelated ridings", () => {
    expect(
      geographyKeep(otherRiding, postDs, RESIDENT, filter, true, openOutsidePost),
    ).toBe(true); // affected
    expect(
      geographyKeep(mine, postDs, RESIDENT, filter, false, openOutsidePost),
    ).toBe(true); // mine, added past the refinements
    expect(
      geographyKeep(
        { districts: ["calgary-mountain-view"] },
        postDs,
        RESIDENT,
        filter,
        true,
        openOutsidePost,
      ),
    ).toBe(false); // neither affected nor mine
  });
});

describe("geographyKeep — both exclusive on a post including my riding", () => {
  // Affected displays Only but adds nothing: My Districts is already narrower.
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: {
      myDistricts: "exclusive",
      affected: "exclusive",
      priority: "affected",
    },
  };
  const postDs = openMultiPost.districts;

  it("narrows to my riding (exclusives AND together)", () => {
    expect(
      geographyKeep(mine, postDs, RESIDENT, filter, true, openMultiPost),
    ).toBe(true);
    expect(
      geographyKeep(namedOther, postDs, RESIDENT, filter, true, openMultiPost),
    ).toBe(false); // affected but not mine — My Districts: Only still narrows
    expect(
      geographyKeep(official, postDs, RESIDENT, filter, true, openMultiPost),
    ).toBe(true); // district-less kept by both
  });

  it("no auto-disable: both remain engaged", () => {
    const geo = resolveGeography(filter, RESIDENT, openMultiPost);
    expect(geo.myDistricts).toBe("exclusive");
    expect(geo.affected).toBe("exclusive");
    expect(geo.autoDisabled).toBeNull();
    expect(geo.interlocked).toBe(false);
  });
});

describe("resolveGeography — implied My Districts (post affects mine among others)", () => {
  const filter: FeedFilterParams = {
    tierMin: 2,
    geography: { myDistricts: "off", affected: "exclusive" },
  };

  it("displays Include on an off My Districts, without inferring it", () => {
    const geo = resolveGeography(filter, RESIDENT, openMultiPost);
    expect(geo.myDistrictsImplied).toBe(true);
    expect(geo.myDistricts).toBe("off"); // Affected alone carries the inference
    // my-district nodes face the same refinements as other affected districts
    const postDs = openMultiPost.districts;
    expect(
      geographyKeep(mine, postDs, RESIDENT, filter, true, openMultiPost),
    ).toBe(true);
    expect(
      geographyKeep(mine, postDs, RESIDENT, filter, false, openMultiPost),
    ).toBe(false); // no inclusive refinement bypass
  });

  it("not implied when the post doesn't affect mine, Affected is off, or My Districts is set", () => {
    expect(
      resolveGeography(filter, RESIDENT, openOutsidePost).myDistrictsImplied,
    ).toBe(false);
    expect(
      resolveGeography(
        { tierMin: 2, geography: { myDistricts: "off", affected: "off" } },
        RESIDENT,
        openMultiPost,
      ).myDistrictsImplied,
    ).toBe(false);
    expect(
      resolveGeography(
        { tierMin: 2, geography: { myDistricts: "inclusive", affected: "exclusive" } },
        RESIDENT,
        openMultiPost,
      ).myDistrictsImplied,
    ).toBe(false);
  });
});

describe("resolveGeography — interlock (post only relates to my districts)", () => {
  it("Affected mirrors My Districts and My Districts alone carries inference", () => {
    const filter: FeedFilterParams = {
      tierMin: 2,
      geography: { myDistricts: "exclusive", affected: "exclusive" },
    };
    const geo = resolveGeography(filter, RESIDENT, openMinePost);
    expect(geo.interlocked).toBe(true);
    expect(geo.myDistricts).toBe("exclusive");
    expect(geo.affected).toBe("off"); // not applied — same set, My Districts is canonical
    expect(geo.autoDisabled).toBeNull();
  });
});

describe("resolveGeography — exclusive conflict on a post outside my districts", () => {
  const bothExclusive = {
    myDistricts: "exclusive",
    affected: "exclusive",
  } as const;

  it("both exclusive: the side last engaged (priority) wins", () => {
    const affWins = resolveGeography(
      { tierMin: 2, geography: { ...bothExclusive, priority: "affected" } },
      RESIDENT,
      openOutsidePost,
    );
    expect(affWins.myDistricts).toBe("off");
    expect(affWins.affected).toBe("exclusive");
    expect(affWins.autoDisabled).toBe("myDistricts");

    const myWins = resolveGeography(
      { tierMin: 2, geography: { ...bothExclusive, priority: "myDistricts" } },
      RESIDENT,
      openOutsidePost,
    );
    expect(myWins.affected).toBe("off");
    expect(myWins.myDistricts).toBe("exclusive");
    expect(myWins.autoDisabled).toBe("affected");
  });

  it("inclusive is never auto-disabled by an exclusive", () => {
    const geo = resolveGeography(
      {
        tierMin: 2,
        geography: {
          myDistricts: "inclusive",
          affected: "exclusive",
          priority: "affected",
        },
      },
      RESIDENT,
      openOutsidePost,
    );
    expect(geo.myDistricts).toBe("inclusive");
    expect(geo.affected).toBe("exclusive");
    expect(geo.autoDisabled).toBeNull();
  });

  it("the disable is temporary: cycling the winner away re-engages the loser", () => {
    // Affected exclusive won; My Districts remembered exclusive was auto-off.
    // The user cycles Affected off — My Districts re-engages untouched.
    const geo = resolveGeography(
      {
        tierMin: 2,
        geography: {
          myDistricts: "exclusive",
          affected: "off",
          priority: "affected",
        },
      },
      RESIDENT,
      openOutsidePost,
    );
    expect(geo.myDistricts).toBe("exclusive");
    expect(geo.autoDisabled).toBeNull();
  });
});

// --- My Jurisdiction (author-residence filter) ------------------------------

/** A small jurisdiction universe for the pure-function tests. */
const JUR = [
  "edmonton-strathcona",
  "edmonton-city-centre",
  "calgary-elbow",
  "calgary-mountain-view",
];

const inJurAuthor = { districts: ["calgary-elbow"], tier: 2 as const };
const officialNoDistrict = { districts: [] as string[], tier: 3 as const };
const outOfProvince = { districts: [] as string[], tier: 2 as const };

describe("authorGeoRelation — residency glyph ladder", () => {
  const ctx = {
    postDistricts: openMultiPost.districts,
    jurisdictionDistricts: JUR,
    viewerDistricts: ["edmonton-strathcona"],
    viewerKycTier: 2 as const,
  };

  it("resolves home > affected > jurisdiction > none, most specific first", () => {
    expect(authorGeoRelation(["edmonton-strathcona"], ctx)).toBe("home");
    expect(authorGeoRelation(["edmonton-city-centre"], ctx)).toBe("affected");
    expect(authorGeoRelation(["calgary-elbow"], ctx)).toBe("jurisdiction");
    expect(authorGeoRelation([], ctx)).toBe("none");
    expect(authorGeoRelation(undefined, ctx)).toBe("none");
  });

  it("home needs a residency-verified viewer (falls to affected otherwise)", () => {
    const anonCtx = { ...ctx, viewerDistricts: [], viewerKycTier: 0 as const };
    expect(authorGeoRelation(["edmonton-strathcona"], anonCtx)).toBe("affected");
  });

  it("jurisdiction-wide post: in-jurisdiction residents are affected, the jurisdiction rung drops", () => {
    const wideCtx = { ...ctx, postDistricts: [] as string[] };
    expect(authorGeoRelation(["calgary-elbow"], wideCtx)).toBe("affected");
    expect(authorGeoRelation(["edmonton-strathcona"], wideCtx)).toBe("home");
    expect(authorGeoRelation([], wideCtx)).toBe("none");
    // naming every jurisdiction district is jurisdiction-wide too
    const allNamedCtx = { ...ctx, postDistricts: [...JUR] };
    expect(authorGeoRelation(["calgary-elbow"], allNamedCtx)).toBe("affected");
  });
});

describe("jurisdictionWidePost / isJurisdictionKeep", () => {
  it("wide when no districts named or every district named", () => {
    expect(jurisdictionWidePost([], JUR)).toBe(true);
    expect(jurisdictionWidePost([...JUR], JUR)).toBe(true);
    expect(jurisdictionWidePost(["calgary-elbow"], JUR)).toBe(false);
  });

  it("keeps in-jurisdiction residents and district-less officials, drops district-less non-officials", () => {
    expect(isJurisdictionKeep(inJurAuthor, JUR)).toBe(true);
    expect(isJurisdictionKeep(officialNoDistrict, JUR)).toBe(true);
    expect(isJurisdictionKeep(outOfProvince, JUR)).toBe(false);
    expect(isJurisdictionKeep({ districts: ["yukon-riding"], tier: 2 }, JUR)).toBe(false);
  });
});

describe("effectiveMyJurisdiction — gating", () => {
  it("off without a district-bearing jurisdiction scope (e.g. Global in the feed)", () => {
    expect(
      effectiveMyJurisdiction({
        geography: { myDistricts: "off", affected: "off", myJurisdiction: "exclusive" },
      }),
    ).toBe("off");
  });

  it("off on a jurisdiction-wide post (mirrors Affected; affected > jurisdiction)", () => {
    const filter: FeedFilterParams = {
      geography: {
        myDistricts: "off",
        affected: "off",
        myJurisdiction: "exclusive",
        jurisdictionDistricts: JUR,
      },
    };
    expect(effectiveMyJurisdiction(filter, { districts: [] })).toBe("off");
    expect(effectiveMyJurisdiction(filter, { districts: [...JUR] })).toBe("off");
    // engaged on a normal post and on list paths (no openPost)
    expect(effectiveMyJurisdiction(filter, openMultiPost)).toBe("exclusive");
    expect(effectiveMyJurisdiction(filter)).toBe("exclusive");
  });
});

describe("geographyKeep — My Jurisdiction modes", () => {
  const exclusive: FeedFilterParams = {
    tierMin: 0,
    geography: {
      myDistricts: "off",
      affected: "off",
      myJurisdiction: "exclusive",
      jurisdictionDistricts: JUR,
    },
  };

  it("Only keeps in-jurisdiction residents + officials, drops out-of-jurisdiction tier-2", () => {
    const postDs = openMultiPost.districts;
    expect(
      geographyKeep(inJurAuthor, postDs, RESIDENT, exclusive, true, openMultiPost),
    ).toBe(true);
    expect(
      geographyKeep(officialNoDistrict, postDs, RESIDENT, exclusive, true, openMultiPost),
    ).toBe(true);
    expect(
      geographyKeep(outOfProvince, postDs, RESIDENT, exclusive, true, openMultiPost),
    ).toBe(false);
  });

  it("Only still drops nodes failing the refinements (AND), and pins Verified to Residency", () => {
    expect(
      geographyKeep(inJurAuthor, openMultiPost.districts, RESIDENT, exclusive, false, openMultiPost),
    ).toBe(false);
    const geo = resolveGeography(exclusive, RESIDENT, openMultiPost);
    expect(pinnedTierMin(0, geo)).toBe(2);
  });

  it("Include adds in-jurisdiction residents past the refinements; district-less never a positive match", () => {
    const inclusive: FeedFilterParams = {
      tierMin: 3,
      geography: {
        myDistricts: "off",
        affected: "off",
        myJurisdiction: "inclusive",
        jurisdictionDistricts: JUR,
      },
    };
    const postDs = openMultiPost.districts;
    expect(
      geographyKeep(inJurAuthor, postDs, RESIDENT, inclusive, false, openMultiPost),
    ).toBe(true);
    expect(
      geographyKeep(officialNoDistrict, postDs, RESIDENT, inclusive, false, openMultiPost),
    ).toBe(false);
    const geo = resolveGeography(inclusive, RESIDENT, openMultiPost);
    expect(pinnedTierMin(0, geo)).toBe(0); // inclusive doesn't pin
  });
});

describe("resolveGeography — jurisdiction inference lattice (display-only)", () => {
  const jurGeo = {
    myDistricts: "off",
    affected: "off",
    jurisdictionDistricts: JUR,
  } as const;

  it("a narrower exclusive implies the Jurisdiction row shows Only", () => {
    for (const narrower of ["affected", "myDistricts"] as const) {
      const geo = resolveGeography(
        {
          tierMin: 2,
          geography: { ...jurGeo, [narrower]: "exclusive", myJurisdiction: "off" },
        },
        RESIDENT,
        openMultiPost,
      );
      expect(geo.jurisdictionImplied).toBe(true);
      expect(geo.myJurisdiction).toBe("off"); // the narrower filter carries the inference
    }
  });

  it("not implied on a jurisdiction-wide post (row is dropped there)", () => {
    const geo = resolveGeography(
      {
        tierMin: 2,
        geography: { ...jurGeo, affected: "exclusive", myJurisdiction: "off" },
      },
      RESIDENT,
      { districts: [...JUR] },
    );
    expect(geo.jurisdictionImplied).toBe(false);
  });

  it("an engaged Jurisdiction implies Affected and My Districts show Include", () => {
    const geo = resolveGeography(
      {
        tierMin: 2,
        geography: { ...jurGeo, myJurisdiction: "inclusive" },
      },
      RESIDENT,
      openMultiPost,
    );
    expect(geo.affectedImplied).toBe(true);
    expect(geo.myDistrictsImplied).toBe(true);
    expect(geo.affected).toBe("off");
    expect(geo.myDistricts).toBe("off");
  });

  it("no Include implication for a viewer whose districts are outside the scope", () => {
    const outsideViewer: ViewerContext = {
      loggedIn: true,
      kycTier: 2,
      viewerDistricts: ["yukon-riding"],
    };
    const geo = resolveGeography(
      {
        tierMin: 2,
        geography: { ...jurGeo, myJurisdiction: "inclusive" },
      },
      outsideViewer,
      openOutsidePost,
    );
    expect(geo.myDistrictsImplied).toBe(false);
    expect(geo.affectedImplied).toBe(true); // affected is still a subset of jurisdiction
  });
});
