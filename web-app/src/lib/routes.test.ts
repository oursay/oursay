import { describe, expect, it } from "vitest";
import { profilePath, personaHintPath } from "./routes";

describe("profilePath", () => {
  it("uses wire handle without @ in the URL", () => {
    expect(profilePath("jane_alberta")).toBe("/profile/jane_alberta");
    expect(profilePath("@jane_alberta")).toBe("/profile/jane_alberta");
  });
});

describe("personaHintPath", () => {
  it("links self persona hints to the persona page", () => {
    expect(
      personaHintPath({
        display: "Jane",
        handle: "jane",
        isPersona: false,
        isSelf: true,
        seed: "jane",
        threadId: "t1",
        seenByOthersAs: "Swift Elm498",
      }),
    ).toBe("/persona/Swift%20Elm498");
    expect(
      personaHintPath({
        display: "Jane",
        handle: "jane",
        isPersona: false,
        isSelf: true,
        seed: "jane",
        threadId: "t1",
      }),
    ).toBeNull();
  });
});
