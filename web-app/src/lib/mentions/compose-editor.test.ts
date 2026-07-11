import { describe, expect, it } from "vitest";
import { renderComposeHtml } from "@/components/content/MentionComposer";
import type { MentionRoster } from "./compose";

const roster: MentionRoster = {
  personas: [],
  profiles: [
    {
      label: "ableg",
      display: "ableg",
      candidate: { kind: "profile", handle: "ableg" },
    },
  ],
};

describe("renderComposeHtml", () => {
  it("wraps roster tags in bold purple spans", () => {
    const html = renderComposeHtml("Hi @ableg there", roster);
    expect(html).toContain('data-mention="1"');
    expect(html).toContain("font-bold text-brand-700");
    expect(html).toContain("@ableg");
    expect(html).toContain("Hi ");
    expect(html).toContain(" there");
  });

  it("leaves unmatched @ as plain escaped text", () => {
    const html = renderComposeHtml("Hi @nobody", roster);
    expect(html).not.toContain("data-mention");
    expect(html).toContain("@nobody");
  });
});
