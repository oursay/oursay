import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Gavel, MapPinHouse, VenetianMask } from "lucide-react";
import { VisibilityIcon, visibilityIconFor } from "./VisibilityIcon";

describe("visibilityIconFor", () => {
  it("maps picker settings to the expected lucide icons", () => {
    expect(visibilityIconFor("anonymous")).toBe(VenetianMask);
    expect(visibilityIconFor("all_officials")).toBe(Gavel);
    expect(visibilityIconFor("my_district")).toBe(MapPinHouse);
    expect(visibilityIconFor("public")).toBeNull();
  });

  it.each([
    ["anonymous", /lucide-venetian-mask/],
    ["all_officials", /lucide-gavel/],
    ["my_district", /lucide-map-pin-house/],
  ] as const)("%s renders the glyph", (visibility, classRe) => {
    const html = renderToStaticMarkup(
      createElement(VisibilityIcon, { visibility, size: 12 }),
    );
    expect(html).toMatch(classRe);
  });

  it("renders nothing for public", () => {
    const html = renderToStaticMarkup(
      createElement(VisibilityIcon, { visibility: "public", size: 12 }),
    );
    expect(html).toBe("");
  });
});
