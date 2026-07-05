import { describe, expect, it } from "vitest";
import {
  COMMENTS_PETITION,
  COMMENTS_STATEMENT,
  JUR_DATA,
  POST_PETITION,
  POST_STATEMENT,
} from "@/lib/mock";
import { ANON_VIEWER, type FeedFilterParams } from "@/lib/types";
import { commentKeep } from "./comment-filter";

describe("commentKeep — Signed filter ladder", () => {
  const openPost = POST_STATEMENT;

  it("Passkey drops signTier 0 comments", () => {
    const unsigned = COMMENTS_STATEMENT[1]; // Marcus Lee
    expect(
      commentKeep(unsigned, openPost, ANON_VIEWER, { signedFilter: 1 }),
    ).toBe(false);
  });

  it("Passkey keeps signTier 1 comments", () => {
    const passkey = COMMENTS_STATEMENT[0]; // Sam Driver
    expect(passkey.signTier).toBe(1);
    expect(
      commentKeep(passkey, openPost, ANON_VIEWER, { signedFilter: 1 }),
    ).toBe(true);
  });

  it("Biometric keeps signTier 2+ only", () => {
    const passkey = COMMENTS_STATEMENT[0];
    const biometric = COMMENTS_STATEMENT[0].replies[0]; // Rae Nguyen
    expect(biometric.signTier).toBe(2);
    expect(
      commentKeep(passkey, openPost, ANON_VIEWER, { signedFilter: 2 }),
    ).toBe(false);
    expect(
      commentKeep(biometric, openPost, ANON_VIEWER, { signedFilter: 2 }),
    ).toBe(true);
  });

  it("Any keeps all comments when signedFilter is 0", () => {
    const unsigned = COMMENTS_STATEMENT[1];
    expect(
      commentKeep(unsigned, openPost, ANON_VIEWER, { signedFilter: 0 }),
    ).toBe(true);
  });
});

describe("commentKeep — My Jurisdiction (author residence, post page)", () => {
  const openPost = POST_PETITION; // Alberta, two Edmonton ridings affected
  const albertaSlugs = JUR_DATA.Alberta.districts.map((d) => d.slug);
  const filter = (myJurisdiction: "inclusive" | "exclusive"): FeedFilterParams => ({
    tierMin: 0,
    geography: {
      myDistricts: "off",
      affected: "off",
      myJurisdiction,
      jurisdictionDistricts: albertaSlugs,
    },
  });
  const byHandle = (handle: string) => {
    const node = COMMENTS_PETITION.find((c) => c.handle === handle);
    if (!node) throw new Error(`missing test comment ${handle}`);
    return node;
  };

  it("Only keeps in-jurisdiction residents and officials, drops out-of-province tier-2", () => {
    // beanowak: calgary-elbow — in Alberta but outside the affected corridor
    expect(commentKeep(byHandle("beanowak"), openPost, ANON_VIEWER, filter("exclusive"))).toBe(true);
    // owenf: edmonton-city-centre — affected riding, of course in jurisdiction
    expect(commentKeep(byHandle("owenf"), openPost, ANON_VIEWER, filter("exclusive"))).toBe(true);
    // lenapark: official — represents the jurisdiction
    expect(commentKeep(byHandle("lenapark"), openPost, ANON_VIEWER, filter("exclusive"))).toBe(true);
    // sarahbc: residency-verified in BC (district-less here) — dropped
    expect(commentKeep(byHandle("sarahbc"), openPost, ANON_VIEWER, filter("exclusive"))).toBe(false);
  });

  it("gates off on a jurisdiction-wide post (mirrors Affected)", () => {
    const widePost = { ...openPost, districts: [] as string[] };
    expect(commentKeep(byHandle("sarahbc"), widePost, ANON_VIEWER, filter("exclusive"))).toBe(true);
  });
});
