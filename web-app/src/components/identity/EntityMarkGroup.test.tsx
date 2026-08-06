import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyMarkModes,
  authorBadgeModes,
  EntityMarkGroup,
  resolveEntityMarks,
} from "@/components/identity/EntityMarkGroup";

describe("resolveEntityMarks", () => {
  it("orders Signed → Official → Media → Platform → KYC", () => {
    const marks = resolveEntityMarks({
      signTier: 1,
      official: true,
      media: true,
      mediaRecognized: true,
      platformRole: "admin",
      tier: 2,
      authorGeo: "home",
    });
    expect(marks.map((m) => m.type)).toEqual([
      "signing",
      "official",
      "media",
      "platform",
      "kyc",
    ]);
  });

  it("emits journalist Media mark; recognized context when mediaRecognized", () => {
    expect(resolveEntityMarks({ media: true, tier: 0 })).toEqual([
      { type: "media", subtype: "journalist" },
    ]);
    expect(resolveEntityMarks({ media: true, mediaRecognized: true, tier: 0 })).toEqual([
      { type: "media", subtype: "journalist", context: "recognized" },
    ]);
  });

  it("sources Official from official flag, not KYC tier", () => {
    expect(resolveEntityMarks({ tier: 2, official: true }).map((m) => m.type)).toEqual([
      "official",
      "kyc",
    ]);
    expect(resolveEntityMarks({ tier: 2 }).map((m) => m.type)).toEqual(["kyc"]);
  });

  it("maps authorGeo home → residency myDistrict context", () => {
    expect(resolveEntityMarks({ tier: 2, authorGeo: "home" })).toEqual([
      { type: "kyc", subtype: "residency", context: "myDistrict" },
    ]);
  });

  it("maps signing strength subtypes", () => {
    expect(resolveEntityMarks({ signTier: 1, tier: 0 })).toEqual([
      { type: "signing", subtype: "passkey" },
    ]);
    expect(resolveEntityMarks({ signTier: 2, tier: 0 })).toEqual([
      { type: "signing", subtype: "fingerprint" },
    ]);
    expect(resolveEntityMarks({ signTier: 3, tier: 0 })).toEqual([
      { type: "signing", subtype: "face" },
    ]);
  });
});

describe("applyMarkModes / authorBadgeModes", () => {
  it("authorBadgeModes still encodes surface defaults (call-site hints)", () => {
    expect(authorBadgeModes("post")).toEqual({ signedMode: "icon", kycMode: "full" });
    expect(authorBadgeModes("comment", 1)).toEqual({
      signedMode: "full",
      kycMode: "icon",
    });
  });

  it("interim: < 3 marks → all full (overrides surface modes)", () => {
    const applied = applyMarkModes(
      resolveEntityMarks({ signTier: 1, tier: 1 }),
      authorBadgeModes("post"),
    );
    expect(applied.map((m) => [m.spec.type, m.mode])).toEqual([
      ["signing", "full"],
      ["kyc", "full"],
    ]);
  });

  it("interim: ≥ 3 expands only highest of official > media > platform", () => {
    const officialWins = applyMarkModes(
      resolveEntityMarks({
        signTier: 1,
        official: true,
        media: true,
        platformRole: "admin",
        tier: 2,
      }),
    );
    expect(officialWins.map((m) => [m.spec.type, m.mode])).toEqual([
      ["signing", "icon"],
      ["official", "full"],
      ["media", "icon"],
      ["platform", "icon"],
      ["kyc", "icon"],
    ]);

    // whyte_public-style: media + platform, no seat → Journalist expanded
    const mediaWins = applyMarkModes(
      resolveEntityMarks({
        signTier: 1,
        media: true,
        platformRole: "admin",
        tier: 1,
      }),
    );
    expect(mediaWins.map((m) => [m.spec.type, m.mode])).toEqual([
      ["signing", "icon"],
      ["media", "full"],
      ["platform", "icon"],
      ["kyc", "icon"],
    ]);

    const platformOnly = applyMarkModes(
      resolveEntityMarks({
        signTier: 1,
        platformRole: "admin",
        tier: 1,
      }),
    );
    expect(platformOnly.map((m) => [m.spec.type, m.mode])).toEqual([
      ["signing", "icon"],
      ["platform", "full"],
      ["kyc", "icon"],
    ]);
  });
});

describe("EntityMarkGroup", () => {
  it("renders nothing when no marks apply", () => {
    const html = renderToStaticMarkup(
      createElement(EntityMarkGroup, {
        tier: 0,
        signedMode: "full",
        kycMode: "full",
      }),
    );
    expect(html).toBe("");
  });

  it("renders multi-mark row", () => {
    const html = renderToStaticMarkup(
      createElement(EntityMarkGroup, {
        signTier: 1,
        official: true,
        platformRole: "admin",
        tier: 2,
        signedMode: "icon",
        kycMode: "full",
      }),
    );
    expect(html).toContain("Passkey");
    expect(html).toContain("Official");
    expect(html).toContain("Admin");
    expect(html).toContain("Residency");
  });
});
