import { describe, expect, it } from "vitest";
import {
  buildScopeHeadLine,
  computeScopeLines,
  computeScopeTailLines,
} from "./scopeTagLines";

const names: Record<string, string> = {
  "edmonton-strathcona": "Edmonton-Strathcona",
  "edmonton-city-centre": "Edmonton-City Centre",
  "calgary-elbow": "Calgary-Elbow",
  "calgary-mountain-view": "Calgary-Mountain View",
  "calgary-forest-lawn": "Calgary-Forest Lawn",
};
const resolve = (slug: string) => names[slug] ?? slug;

/** Monospace-ish estimate for unit tests (real layout uses DOM measurement). */
function estimateWidth(text: string): number {
  return text.length * 6.5;
}

describe("buildScopeHeadLine", () => {
  it("includes jurisdiction and a trailing comma", () => {
    const line = buildScopeHeadLine(
      ["calgary-elbow", "calgary-mountain-view"],
      "Alberta",
      resolve,
    );
    expect(line.map((s) => s[0]).join("")).toBe("Alberta · Calgary-Elbow,");
  });
});

describe("computeScopeTailLines", () => {
  it("keeps +1 tails on one line", () => {
    const lines = computeScopeTailLines(
      ["edmonton-strathcona", "edmonton-city-centre"],
      resolve,
      400,
      estimateWidth,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.map((s) => s[0]).join("")).toBe(
      "Edmonton-City Centre · See Less",
    );
  });

  it("packs 3 districts onto one tail line when width allows", () => {
    const lines = computeScopeTailLines(
      ["calgary-elbow", "calgary-mountain-view", "calgary-forest-lawn"],
      resolve,
      350,
      estimateWidth,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.map((s) => s[0]).join("")).toBe(
      "Calgary-Mountain View, Calgary-Forest Lawn · See Less",
    );
  });

  it("never puts See Less on its own line", () => {
    const lines = computeScopeTailLines(
      ["calgary-elbow", "calgary-mountain-view", "calgary-forest-lawn"],
      resolve,
      80,
      estimateWidth,
    );
    for (const line of lines) {
      const text = line.map((s) => s[0]).join("");
      expect(text).not.toBe("See Less");
      if (text.includes("See Less")) {
        expect(text).toMatch(/ · See Less$/);
      }
    }
  });
});

describe("computeScopeLines", () => {
  it("keeps +1 posts on two lines", () => {
    const lines = computeScopeLines(
      ["edmonton-strathcona", "edmonton-city-centre"],
      "Alberta",
      resolve,
      400,
      estimateWidth,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]!.map((s) => s[0]).join("")).toBe(
      "Alberta · Edmonton-Strathcona,",
    );
    expect(lines[1]!.map((s) => s[0]).join("")).toBe(
      "Edmonton-City Centre · See Less",
    );
  });

  it("wraps 3+ districts onto a second line when needed", () => {
    const lines = computeScopeLines(
      ["calgary-elbow", "calgary-mountain-view", "calgary-forest-lawn"],
      "Alberta",
      resolve,
      350,
      estimateWidth,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]!.map((s) => s[0]).join("")).toBe("Alberta · Calgary-Elbow,");
    expect(lines[1]!.map((s) => s[0]).join("")).toBe(
      "Calgary-Mountain View, Calgary-Forest Lawn · See Less",
    );
  });
});
