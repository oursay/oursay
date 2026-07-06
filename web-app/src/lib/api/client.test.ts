import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQuery, isMockOnly } from "./client";

describe("isMockOnly", () => {
  const prev = process.env.NEXT_PUBLIC_MOCK_ONLY;

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_MOCK_ONLY;
    else process.env.NEXT_PUBLIC_MOCK_ONLY = prev;
  });

  it("defaults to mock mode when unset", () => {
    delete process.env.NEXT_PUBLIC_MOCK_ONLY;
    expect(isMockOnly()).toBe(true);
  });

  it("disables mock when NEXT_PUBLIC_MOCK_ONLY=0", () => {
    process.env.NEXT_PUBLIC_MOCK_ONLY = "0";
    expect(isMockOnly()).toBe(false);
  });

  it("disables mock when NEXT_PUBLIC_MOCK_ONLY=false", () => {
    process.env.NEXT_PUBLIC_MOCK_ONLY = "false";
    expect(isMockOnly()).toBe(false);
  });
});

describe("buildQuery", () => {
  it("encodes scalar and repeated array params", () => {
    const qs = buildQuery({
      limit: 20,
      types: ["post", "poll"],
      cursor: undefined,
    });
    expect(qs).toBe("?limit=20&types=post&types=poll");
  });

  it("returns empty string when no params", () => {
    expect(buildQuery({})).toBe("");
  });
});
