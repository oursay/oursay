import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimestampWithAnchor } from "./TimestampWithAnchor";

describe("TimestampWithAnchor", () => {
  it("renders time without a badge when not externally anchored", () => {
    const html = renderToStaticMarkup(
      createElement(TimestampWithAnchor, { time: "2h ago", externallyAnchored: false }),
    );
    expect(html).toContain("2h ago");
    expect(html).not.toContain("Verified on the public audit ledger");
  });

  it("renders the FileBadge when externally anchored", () => {
    const html = renderToStaticMarkup(
      createElement(TimestampWithAnchor, { time: "2026-07-16", externallyAnchored: true }),
    );
    expect(html).toContain("2026-07-16");
    expect(html).toContain("Verified on the public audit ledger");
  });
});
