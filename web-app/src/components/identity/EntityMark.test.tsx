import { createElement } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EntityMark,
  EntityMarkBase,
  entityMarkBackground,
  entityMarkForeground,
  type EntityMarkSpec,
} from "@/components/identity/EntityMark";

function renderMark(spec: EntityMarkSpec & { mode?: "full" | "icon"; className?: string }) {
  return renderToStaticMarkup(createElement(EntityMark, spec));
}

/** Expected color-mix pct for shades 1–9 (shade 10 is the raw CSS var). */
function huePct(shade: number): string {
  return (30 + ((shade - 1) * 70) / 9).toFixed(2);
}

describe("EntityMark registry labels", () => {
  it.each([
    [{ type: "signing", subtype: "passkey" }, "Passkey"],
    [{ type: "signing", subtype: "fingerprint" }, "Fingerprint"],
    [{ type: "signing", subtype: "face" }, "Face"],
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

  it("uses the official hue CSS var (static string — keeps @theme token)", () => {
    const html = renderMark({ type: "official", subtype: "official" });
    expect(html).toContain("background-color:var(--color-mark-official)");
    expect(html).not.toContain("color-mix");
  });

  it("mixes toward the hue mix token for shades under 10", () => {
    // moderator = platform shade 1
    const html = renderMark({ type: "platform", subtype: "moderator" });
    expect(html).toContain(
      `color-mix(in oklch, var(--color-mark-platform) ${huePct(1)}%, var(--color-mark-platform-mix))`,
    );
  });

  it("uses signing shade ladder 7→8→9 (passkey / fingerprint / face)", () => {
    const passkey = renderMark({ type: "signing", subtype: "passkey" });
    expect(passkey).toContain(
      `color-mix(in oklch, var(--color-mark-signing) ${huePct(7)}%, var(--color-mark-signing-mix))`,
    );

    const fingerprint = renderMark({
      type: "signing",
      subtype: "fingerprint",
    });
    expect(fingerprint).toContain(
      `color-mix(in oklch, var(--color-mark-signing) ${huePct(8)}%, var(--color-mark-signing-mix))`,
    );

    const face = renderMark({ type: "signing", subtype: "face" });
    expect(face).toContain(
      `color-mix(in oklch, var(--color-mark-signing) ${huePct(9)}%, var(--color-mark-signing-mix))`,
    );
  });

  it("uses residency context shade overrides", () => {
    const residency = renderMark({ type: "kyc", subtype: "residency" });
    expect(residency).toContain(
      `color-mix(in oklch, var(--color-mark-kyc) ${huePct(3)}%, var(--color-mark-kyc-mix))`,
    );

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
    expect(myDistrict).toContain("background-color:var(--color-mark-kyc)");
    expect(myDistrict).not.toContain("color-mix");
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
  it("uses theme-stable dark text on pale non-signing mixes (shade ≤ 3)", () => {
    const mod = renderMark({ type: "platform", subtype: "moderator" });
    expect(mod).toContain("text-mark-on-tint");
    expect(mod).not.toContain("text-ink");
    expect(mod).not.toContain("text-white");
  });

  it("always uses text-white for signing (honey chip, both themes)", () => {
    const passkey = renderMark({ type: "signing", subtype: "passkey" });
    expect(passkey).toContain("text-white");
    expect(passkey).not.toContain("text-mark-on-tint");
    expect(passkey).not.toContain("text-ink");
  });

  it("uses text-white for stronger non-KYC fills (shade ≥ 4)", () => {
    const admin = renderMark({ type: "platform", subtype: "admin" });
    expect(admin).toContain("text-white");
    expect(admin).not.toContain("text-ink");
    expect(admin).not.toContain("text-mark-on-tint");
  });

  it("uses dark text through residency, white from jurisdiction up", () => {
    const identity = renderMark({ type: "kyc", subtype: "identity" });
    expect(identity).toContain("text-mark-on-tint");

    const residency = renderMark({ type: "kyc", subtype: "residency" });
    expect(residency).toContain("text-mark-on-tint");
    expect(residency).not.toContain("text-white");

    const jurisdiction = renderMark({
      type: "kyc",
      subtype: "residency",
      context: "jurisdiction",
    });
    expect(jurisdiction).toContain("text-white");
    expect(jurisdiction).not.toContain("text-mark-on-tint");

    const affected = renderMark({
      type: "kyc",
      subtype: "residency",
      context: "affected",
    });
    expect(affected).toContain("text-white");
  });

  it("always uses text-paper for official", () => {
    const html = renderMark({ type: "official", subtype: "official" });
    expect(html).toContain("text-paper");
    expect(html).not.toContain("text-ink");
    expect(html).not.toContain("text-white");
    expect(html).not.toContain("text-mark-on-tint");
  });
});

describe("entityMarkBackground / entityMarkForeground", () => {
  it("matches EntityMark fills for KYC identity and residency", () => {
    const identity = { type: "kyc", subtype: "identity" } as const;
    const residency = { type: "kyc", subtype: "residency" } as const;

    expect(entityMarkBackground(identity)).toBe(
      `color-mix(in oklch, var(--color-mark-kyc) ${huePct(1)}%, var(--color-mark-kyc-mix))`,
    );
    expect(entityMarkForeground(identity)).toBe("text-mark-on-tint");

    expect(entityMarkBackground(residency)).toBe(
      `color-mix(in oklch, var(--color-mark-kyc) ${huePct(3)}%, var(--color-mark-kyc-mix))`,
    );
    expect(entityMarkForeground(residency)).toBe("text-mark-on-tint");
    expect(
      entityMarkForeground({
        type: "kyc",
        subtype: "residency",
        context: "jurisdiction",
      }),
    ).toBe("text-white");
  });
});

describe("Official mark theme tokens", () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../styles/global.css"),
    "utf8",
  );

  /** Slice from `@theme {` up to the following `html.dark {` (light tokens only). */
  function themeBlock(): string {
    const start = css.indexOf("@theme {");
    const end = css.indexOf("html.dark {");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return css.slice(start, end);
  }

  /** Slice from `html.dark {` through its closing brace at indent 0. */
  function darkBlock(): string {
    const start = css.indexOf("html.dark {");
    expect(start).toBeGreaterThanOrEqual(0);
    const after = css.slice(start);
    const close = after.indexOf("\n}");
    expect(close).toBeGreaterThan(0);
    return after.slice(0, close + 2);
  }

  it("defines a dark slate Official chip in light @theme", () => {
    // Light Official must be near-black — if tree-shaken, bg falls through to paper (white).
    const theme = themeBlock();
    expect(theme).toMatch(/--color-mark-official:\s*#111827/);
    expect(theme).toMatch(/--color-mark-official-mix:\s*white/);
  });

  it("inverts Official to near-white under html.dark", () => {
    const dark = darkBlock();
    expect(dark).toMatch(/--color-mark-official:\s*#e5e7eb/);
    expect(dark).toMatch(/--color-mark-official-mix:\s*black/);
  });

  it("keeps light and dark Official anchors distinct", () => {
    const themeOfficial = themeBlock().match(
      /--color-mark-official:\s*(#[0-9a-fA-F]+)/,
    )?.[1];
    const darkOfficial = darkBlock().match(
      /--color-mark-official:\s*(#[0-9a-fA-F]+)/,
    )?.[1];
    expect(themeOfficial).toBe("#111827");
    expect(darkOfficial).toBe("#e5e7eb");
    expect(themeOfficial).not.toBe(darkOfficial);
  });

  it("does not lighten colour mark anchors under html.dark", () => {
    const dark = darkBlock();
    expect(dark).not.toMatch(/--color-mark-kyc:/);
    expect(dark).not.toMatch(/--color-mark-signing:/);
    expect(dark).not.toMatch(/--color-mark-platform:/);
    expect(dark).not.toMatch(/--color-mark-media:/);
  });

  it("keeps pale-mark label colour theme-stable (not redefined in dark)", () => {
    expect(themeBlock()).toMatch(/--color-mark-on-tint:\s*#111827/);
    expect(darkBlock()).not.toMatch(/--color-mark-on-tint:/);
  });

  it("uses a deep honey signing anchor", () => {
    expect(themeBlock()).toMatch(/--color-mark-signing:\s*#b8860b/);
  });
});

describe("EntityMark icons", () => {
  it.each([
    [{ type: "signing", subtype: "passkey" }, /lucide-key/],
    [{ type: "signing", subtype: "fingerprint" }, /lucide-fingerprint/],
    [{ type: "signing", subtype: "face" }, /lucide-scan-face/],
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
