import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AuthorBadgeGroup } from "@/components/identity/AuthorBadgeGroup";
import { AuthorRow } from "@/components/identity/AuthorRow";
import { mapPlatformRole } from "@/lib/api/map";

describe("mapPlatformRole", () => {
  it("maps wire platformRoles to narrow client field", () => {
    expect(mapPlatformRole(["admin"])).toBe("admin");
    expect(mapPlatformRole(["dev"])).toBe(null);
    expect(mapPlatformRole([])).toBe(null);
    expect(mapPlatformRole(undefined)).toBe(null);
  });
});

describe("AuthorBadgeGroup Platform mark", () => {
  it("renders Admin mark when platformRole is admin", () => {
    const html = renderToStaticMarkup(
      createElement(AuthorBadgeGroup, {
        tier: 1,
        platformRole: "admin",
        signedMode: "icon",
        kycMode: "full",
      }),
    );
    expect(html).toContain("Admin");
    expect(html).toMatch(/lucide-globe/);
  });

  it("omits Platform mark when platformRole is absent", () => {
    const html = renderToStaticMarkup(
      createElement(AuthorBadgeGroup, {
        tier: 1,
        signedMode: "icon",
        kycMode: "full",
      }),
    );
    expect(html).not.toContain("Admin");
  });

  it("renders Official from official flag beside KYC", () => {
    const html = renderToStaticMarkup(
      createElement(AuthorBadgeGroup, {
        tier: 2,
        official: true,
        signedMode: "icon",
        kycMode: "full",
      }),
    );
    expect(html).toContain("Official");
    expect(html).toContain("Residency");
  });
});

describe("AuthorRow Platform mark", () => {
  it("surfaces Admin mark through AuthorRow", () => {
    const withMark = renderToStaticMarkup(
      createElement(AuthorRow, {
        author: "Ada Admin",
        handle: "ada",
        tier: 0,
        platformRole: "admin",
      }),
    );
    expect(withMark).toContain("Admin");

    const without = renderToStaticMarkup(
      createElement(AuthorRow, {
        author: "Bob",
        handle: "bob",
        tier: 0,
      }),
    );
    expect(without).not.toContain("Admin");
  });
});
