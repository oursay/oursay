import { describe, expect, it } from "vitest";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";
import { warningsForAction } from "./warning-eligibility";

describe("warningsForAction", () => {
  const ctx = (kycTier: number, outside = false) => ({
    kycTier: kycTier as 0 | 1 | 2,
    outsideAffectedDistricts: outside,
  });

  it("Alberta vote: hard blocker when unverified (residency required to act)", () => {
    const w = warningsForAction(ALBERTA_ID, "vote", ctx(0));
    expect(w.map((x) => x.kind)).toEqual(["blocker"]);
    expect(w[0].reason).toBe("requires verified residency");
  });

  it("Alberta petition signature: irrevocable + residency count-floor when unverified", () => {
    const w = warningsForAction(ALBERTA_ID, "signature", ctx(0));
    expect(w.map((x) => x.kind)).toEqual(["irrevocable", "count-floor"]);
    expect(w[1].countBasis).toBe("residency");
  });

  it("Alberta petition compose: hard blocker (tier-2 required to act)", () => {
    const w = warningsForAction(ALBERTA_ID, "post.petition", ctx(0));
    expect(w.map((x) => x.kind)).toEqual(["blocker"]);
  });

  it("Alberta statement compose: no warnings", () => {
    const w = warningsForAction(ALBERTA_ID, "post.statement", ctx(0));
    expect(w).toEqual([]);
  });

  it("Global vote: identity count-floor when unverified, no irrevocable", () => {
    const w = warningsForAction(GLOBAL_ID, "vote", ctx(0));
    expect(w.map((x) => x.kind)).toEqual(["count-floor"]);
    expect(w[0].countBasis).toBe("identity");
  });

  it("comment and reaction: no warnings", () => {
    expect(warningsForAction(ALBERTA_ID, "comment", ctx(0))).toEqual([]);
    expect(warningsForAction(ALBERTA_ID, "reaction", ctx(0))).toEqual([]);
    expect(warningsForAction(GLOBAL_ID, "comment", ctx(0))).toEqual([]);
  });

  it("Alberta vote: affected districts when residency-verified and outside", () => {
    const w = warningsForAction(ALBERTA_ID, "vote", ctx(2, true));
    expect(w.map((x) => x.kind)).toContain("irrevocable");
    expect(w.map((x) => x.kind)).toContain("affected");
  });
});
