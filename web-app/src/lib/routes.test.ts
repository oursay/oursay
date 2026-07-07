import { describe, expect, it } from "vitest";
import { districtPath, officialPath, profilePath, personaHintPath } from "./routes";

describe("districtPath", () => {
  it("uses an explicit jurisdiction slug for districts outside the mock registry", () => {
    expect(
      districtPath("athabasca-barrhead-westlock", { jurisdictionSlug: "alberta" }),
    ).toBe("/jurisdiction/alberta/district/athabasca-barrhead-westlock");
  });

  it("resolves mock corpus districts without an explicit jurisdiction", () => {
    expect(districtPath("calgary-elbow")).toBe("/jurisdiction/alberta/district/calgary-elbow");
  });

  it("routes jurisdiction leaders to the official profile surface", () => {
    expect(officialPath("premier")).toBe("/official/premier");
    expect(officialPath("@oursay")).toBe("/official/oursay");
  });
});

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
