import { describe, expect, it } from "vitest";
import { civicExtra, scaleSocial } from "./scaling";

describe("scaleSocial", () => {
  it("thins a social count at every Verified tier (wireframe 204 example)", () => {
    expect(scaleSocial(204, 0)).toBe(204);
    expect(scaleSocial(204, 1)).toBe(126);
    expect(scaleSocial(204, 2)).toBe(69);
    expect(scaleSocial(204, 3)).toBe(16);
  });
});

describe("civicExtra", () => {
  it("adds the unverified civic note below Residency (wireframe 7,999 example)", () => {
    expect(civicExtra(7999, 0)).toBe(2800);
    expect(civicExtra(7999, 1)).toBe(960);
    expect(civicExtra(7999, 2)).toBe(0);
    expect(civicExtra(7999, 3)).toBe(0);
  });
});
