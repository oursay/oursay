import { describe, expect, it } from "vitest";
import { avatarDataUri } from "./avatar";

describe("avatarDataUri (DiceBear v10, initial-face)", () => {
  it("returns a deterministic SVG data URI per seed", () => {
    const a = avatarDataUri("alex_morgan");
    expect(a).toMatch(/^data:image\/svg\+xml/);
    expect(avatarDataUri("alex_morgan")).toBe(a);
  });

  it("different seeds produce different avatars", () => {
    expect(avatarDataUri("alex_morgan")).not.toBe(avatarDataUri("BraveOtter42"));
  });
});
