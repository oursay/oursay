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
  it("orders Signed → Official → Platform → KYC", () => {
    const marks = resolveEntityMarks({
      signTier: 1,
      official: true,
      platformRole: "admin",
      tier: 2,
      authorGeo: "home",
    });
    expect(marks.map((m) => m.type)).toEqual([
      "signing",
      "official",
      "platform",
      "kyc",
    ]);
  });

  it("does not emit Media even when media is true (reserved)", () => {
    const marks = resolveEntityMarks({
      media: true,
      tier: 1,
    });
    expect(marks.every((m) => m.type !== "media")).toBe(true);
    expect(marks).toEqual([{ type: "kyc", subtype: "identity" }]);
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
  it("post surface: signed icon, others full", () => {
    const modes = authorBadgeModes("post");
    expect(modes).toEqual({ signedMode: "icon", kycMode: "full" });
    const applied = applyMarkModes(
      resolveEntityMarks({ signTier: 1, tier: 1, official: true }),
      modes,
    );
    expect(applied.map((m) => m.mode)).toEqual(["icon", "full", "full"]);
  });

  it("root comment: signed full, others icon", () => {
    expect(authorBadgeModes("comment", 1)).toEqual({
      signedMode: "full",
      kycMode: "icon",
    });
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
