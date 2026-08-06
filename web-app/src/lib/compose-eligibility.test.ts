import { describe, expect, it } from "vitest";
import { ALBERTA_ID, GLOBAL_ID, type VerificationTier } from "@/lib/types";
import { gateFor } from "@/lib/mock/gates";
import {
  actAdmits,
  canComposeInJurisdiction,
  composeTypeLockReason,
  isComposeTypeLocked,
  rootTypesForJurisdiction,
  type ComposeViewer,
} from "./compose-eligibility";

const viewer = (
  kycTier: VerificationTier,
  extra: Partial<ComposeViewer> = {},
): ComposeViewer => ({ kycTier, ...extra });

describe("compose eligibility (config-driven from jurisdiction gates)", () => {
  it("allows statements in any jurisdiction, any tier", () => {
    expect(canComposeInJurisdiction(GLOBAL_ID, "statement", viewer(0))).toBe(true);
    expect(canComposeInJurisdiction(ALBERTA_ID, "statement", viewer(0))).toBe(true);
  });

  it("locks Alberta petitions below residency (act gate {tiers:[2]})", () => {
    expect(isComposeTypeLocked(ALBERTA_ID, "petition", viewer(1))).toBe(true);
    expect(composeTypeLockReason(ALBERTA_ID, "petition", viewer(1))).toBe(
      "Residency-verified only",
    );
    expect(canComposeInJurisdiction(ALBERTA_ID, "petition", viewer(2))).toBe(true);
    // Global petitions are open to anyone.
    expect(canComposeInJurisdiction(GLOBAL_ID, "petition", viewer(0))).toBe(true);
  });

  it("makes Alberta polls Official OR accredited media OR platform admin", () => {
    // Global polls are open to anyone.
    expect(canComposeInJurisdiction(GLOBAL_ID, "poll", viewer(0))).toBe(true);
    // A high-tier NON-official without media/admin cannot create an Alberta poll.
    expect(canComposeInJurisdiction(ALBERTA_ID, "poll", viewer(2))).toBe(false);
    expect(composeTypeLockReason(ALBERTA_ID, "poll", viewer(0))).toMatch(
      /official|accredited media|platform admin/i,
    );
    expect(composeTypeLockReason(ALBERTA_ID, "poll", viewer(0))).not.toBe("Officials only");
    // An official can.
    expect(
      canComposeInJurisdiction(ALBERTA_ID, "poll", viewer(1, { role: "official" })),
    ).toBe(true);
    // Accredited media (recognized body) can.
    expect(
      canComposeInJurisdiction(
        ALBERTA_ID,
        "poll",
        viewer(0, { accreditationBodyIds: ["ab-leg-gallery"] }),
      ),
    ).toBe(true);
    // Unrecognized body alone cannot.
    expect(
      canComposeInJurisdiction(
        ALBERTA_ID,
        "poll",
        viewer(0, { accreditationBodyIds: ["ca-caj-example"] }),
      ),
    ).toBe(false);
    // Platform admin can.
    expect(
      canComposeInJurisdiction(ALBERTA_ID, "poll", viewer(0, { platformRoles: ["admin"] })),
    ).toBe(true);
  });

  it("does not unlock Alberta result act for media (result stays official-only)", () => {
    expect(
      actAdmits(
        gateFor(ALBERTA_ID, "result").act,
        viewer(0, { accreditationBodyIds: ["ab-leg-gallery"] }),
        ALBERTA_ID,
      ),
    ).toBe(false);
    expect(
      actAdmits(
        gateFor(ALBERTA_ID, "result").act,
        viewer(0, { platformRoles: ["admin"] }),
        ALBERTA_ID,
      ),
    ).toBe(false);
    expect(
      actAdmits(gateFor(ALBERTA_ID, "result").act, viewer(0, { role: "official" }), ALBERTA_ID),
    ).toBe(true);
  });

  it("offers all three root types everywhere (locking is the gate's job, not the offered set)", () => {
    expect(rootTypesForJurisdiction(ALBERTA_ID)).toContain("poll");
    expect(rootTypesForJurisdiction(GLOBAL_ID)).toContain("poll");
    expect(rootTypesForJurisdiction(ALBERTA_ID)).toEqual([
      "statement",
      "petition",
      "poll",
    ]);
  });
});
