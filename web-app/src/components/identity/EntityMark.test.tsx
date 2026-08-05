import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EntityMark,
  EntityMarkBase,
  type EntityMarkSpec,
} from "@/components/identity/EntityMark";

function renderMark(spec: EntityMarkSpec & { mode?: "full" | "icon"; className?: string }) {
  return renderToStaticMarkup(createElement(EntityMark, spec));
}

/** Expected color-mix pct for shades 1–9 (shade 10 is the raw CSS var). */
function huePct(shade: number): string {
  return (50 + ((shade - 1) * 50) / 9).toFixed(2);
}

describe("EntityMark registry labels", () => {
  it.each([
    [{ type: "signing", subtype: "passkey" }, "Passkey"],
    [{ type: "platform", subtype: "moderator" }, "Mod"],
    [{ type: "platform", subtype: "developer" }, "Dev"],
    [{ type: "platform", subtype: "admin" }, "Admin"],
    [{ type: "kyc", subtype: "identity" }, "Identity"],
    [{ type: "kyc", subtype: "residency" }, "Residency"],
    [{ type: "media", subtype: "journalist" }, "Journalist"],
    [{ type: "official", subtype: "official" }, "Official"],
  ] as const)("%j → %s", (spec, label) => {
    const html = renderMark({ ...spec, mode: "full" });
    expect(html).toContain(`>${label}</span>`);
  });

  it.each([
    [
      { type: "kyc", subtype: "residency", context: "jurisdiction" },
      "Jurisdiction",
    ],
    [{ type: "kyc", subtype: "residency", context: "affected" }, "Affected"],
    [{ type: "kyc", subtype: "residency", context: "myDistrict" }, "MyDistrict"],
    [
      { type: "media", subtype: "journalist", context: "recognized" },
      "Journalist",
    ],
  ] as const)("context %j → %s", (spec, label) => {
    const html = renderMark({ ...spec, mode: "full" });
    expect(html).toContain(`>${label}</span>`);
  });
});

describe("EntityMark mode", () => {
  it("renders a static full pill with visible label", () => {
    const html = renderMark({
      type: "signing",
      subtype: "passkey",
      mode: "full",
    });
    expect(html).toMatch(/^<span /);
    expect(html).toContain(">Passkey</span>");
    expect(html).toContain("px-1.5");
    expect(html).not.toContain("aria-expanded");
  });

  it("renders an expandable icon button with hidden label", () => {
    const html = renderMark({
      type: "signing",
      subtype: "passkey",
      mode: "icon",
    });
    expect(html).toMatch(/^<button /);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Passkey"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("h-4");
    expect(html).toContain("min-w-4");
    expect(html).toContain("hover:px-1.5");
    expect(html).toContain("data-[expanded]:px-1.5");
    expect(html).toContain(
      'class="hidden whitespace-nowrap group-hover:inline group-data-[expanded]:inline"',
    );
    expect(html).toContain(">Passkey</span>");
  });

  it("defaults to full mode", () => {
    const html = renderMark({ type: "platform", subtype: "admin" });
    expect(html).toMatch(/^<span /);
    expect(html).toContain(">Admin</span>");
  });
});

describe("EntityMark shade → background", () => {
  it("uses the hue CSS var at shade 10", () => {
    const html = renderMark({ type: "platform", subtype: "admin" });
    expect(html).toContain("background-color:var(--color-mark-platform)");
    expect(html).not.toContain("color-mix");
  });

  it("mixes toward the hue mix token for shades under 10", () => {
    // passkey = signing shade 1
    const html = renderMark({ type: "signing", subtype: "passkey" });
    expect(html).toContain(
      `color-mix(in oklch, var(--color-mark-signing) ${huePct(1)}%, var(--color-mark-signing-mix))`,
    );
  });

  it("uses residency context shade overrides", () => {
    const affected = renderMark({
      type: "kyc",
      subtype: "residency",
      context: "affected",
    });
    expect(affected).toContain(
      `color-mix(in oklch, var(--color-mark-kyc) ${huePct(7)}%, var(--color-mark-kyc-mix))`,
    );

    const myDistrict = renderMark({
      type: "kyc",
      subtype: "residency",
      context: "myDistrict",
    });
    expect(myDistrict).toContain(
      `color-mix(in oklch, var(--color-mark-kyc) ${huePct(9)}%, var(--color-mark-kyc-mix))`,
    );
  });

  it("keeps hue on the type family when context only changes shade", () => {
    const html = renderMark({
      type: "media",
      subtype: "journalist",
      context: "recognized",
    });
    expect(html).toContain("background-color:var(--color-mark-media)");
  });
});

describe("EntityMark shade → foreground", () => {
  it("uses text-ink for pale mixes (shade ≤ 3)", () => {
    const passkey = renderMark({ type: "signing", subtype: "passkey" });
    expect(passkey).toContain("text-ink");
    expect(passkey).not.toContain("text-white");

    const residency = renderMark({ type: "kyc", subtype: "residency" });
    expect(residency).toContain("text-ink");
  });

  it("uses text-white for stronger fills (shade ≥ 4)", () => {
    const admin = renderMark({ type: "platform", subtype: "admin" });
    expect(admin).toContain("text-white");
    expect(admin).not.toContain("text-ink");

    const identity = renderMark({ type: "kyc", subtype: "identity" });
    expect(identity).toContain("text-white");
  });

  it("always uses text-paper for official", () => {
    const html = renderMark({ type: "official", subtype: "official" });
    expect(html).toContain("text-paper");
    expect(html).not.toContain("text-ink");
    expect(html).not.toContain("text-white");
  });
});

describe("EntityMark icons", () => {
  it.each([
    [{ type: "signing", subtype: "passkey" }, /lucide-key/],
    [{ type: "platform", subtype: "moderator" }, /lucide-shield-alert/],
    [{ type: "platform", subtype: "developer" }, /lucide-code-xml/],
    [{ type: "platform", subtype: "admin" }, /lucide-globe/],
    [{ type: "kyc", subtype: "identity" }, /lucide-id-card(?!-)/],
    [{ type: "kyc", subtype: "residency" }, /lucide-map-pin(?![-\w])/],
    [
      { type: "kyc", subtype: "residency", context: "jurisdiction" },
      /lucide-map-pinned/,
    ],
    [
      { type: "kyc", subtype: "residency", context: "affected" },
      /lucide-map-pin-check/,
    ],
    [
      { type: "kyc", subtype: "residency", context: "myDistrict" },
      /lucide-map-pin-house/,
    ],
    [{ type: "media", subtype: "journalist" }, /lucide-notebook-pen/],
    [
      { type: "media", subtype: "journalist", context: "recognized" },
      /lucide-id-card-lanyard/,
    ],
    [{ type: "official", subtype: "official" }, /lucide-gavel/],
  ] as const)("%j renders expected lucide icon", (spec, iconClass) => {
    const html = renderMark({ ...spec, mode: "icon" });
    expect(html).toMatch(iconClass);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("shrink-0");
  });
});

describe("EntityMarkBase", () => {
  it("merges caller style over backgroundColor in full mode", () => {
    const html = renderToStaticMarkup(
      createElement(EntityMarkBase, {
        bgColor: "red",
        fgColor: "text-white",
        icon: createElement("span", { "data-testid": "icon" }),
        label: "X",
        mode: "full",
        style: { opacity: 0.5 },
        id: "mark",
      }),
    );
    expect(html).toContain('id="mark"');
    expect(html).toContain("background-color:red");
    expect(html).toContain("opacity:0.5");
    expect(html).toContain(">X</span>");
  });

  it("renders expandable chrome in icon mode", () => {
    const html = renderToStaticMarkup(
      createElement(EntityMarkBase, {
        bgColor: "blue",
        fgColor: "text-ink",
        icon: createElement("span", { "data-testid": "icon" }),
        label: "Hidden",
        mode: "icon",
      }),
    );
    expect(html).toMatch(/^<button /);
    expect(html).toContain('aria-label="Hidden"');
    expect(html).toContain(
      'class="hidden whitespace-nowrap group-hover:inline group-data-[expanded]:inline"',
    );
    expect(html).toContain("background-color:blue");
  });
});
