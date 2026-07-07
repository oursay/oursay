import { describe, expect, it } from "vitest";
import { profilePath } from "./routes";

describe("profilePath", () => {
  it("uses wire handle without @ in the URL", () => {
    expect(profilePath("jane_alberta")).toBe("/profile/jane_alberta");
    expect(profilePath("@jane_alberta")).toBe("/profile/jane_alberta");
  });
});
