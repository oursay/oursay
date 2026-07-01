import { describe, expect, it } from "vitest";
import {
  canComposeInJurisdiction,
  composeTypeLockReason,
  isComposeTypeLocked,
  rootTypesForJurisdiction,
} from "./compose-eligibility";

describe("compose eligibility", () => {
  it("allows statements in any jurisdiction", () => {
    expect(canComposeInJurisdiction("Global", "statement", 0)).toBe(true);
    expect(canComposeInJurisdiction("Alberta", "statement", 0)).toBe(true);
  });

  it("locks Alberta petitions below residency", () => {
    expect(isComposeTypeLocked("Alberta", "petition", 1)).toBe(true);
    expect(composeTypeLockReason("Alberta", "petition", 1)).toBe(
      "Residency-verified only",
    );
    expect(canComposeInJurisdiction("Alberta", "petition", 2)).toBe(true);
    expect(canComposeInJurisdiction("Global", "petition", 0)).toBe(true);
  });

  it("allows polls in Global only", () => {
    expect(canComposeInJurisdiction("Global", "poll", 0)).toBe(true);
    expect(canComposeInJurisdiction("Alberta", "poll", 3)).toBe(false);
    expect(composeTypeLockReason("Alberta", "poll", 0)).toBe("type N/A");
    expect(rootTypesForJurisdiction("Alberta")).not.toContain("poll");
    expect(rootTypesForJurisdiction("Global")).toContain("poll");
  });
});
