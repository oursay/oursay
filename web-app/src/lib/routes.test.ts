import { describe, expect, it } from "vitest";
import { encodeUuidV4Base59 } from "@oursay/encode";
import { districtPath, officialPath, postPath, profilePath, personaHintPath } from "./routes";

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("postPath", () => {
  it("uses Base59 for UUID v4 record ids", () => {
    const slug = encodeUuidV4Base59(SAMPLE_UUID);
    expect(postPath("statement", SAMPLE_UUID)).toBe(`/statement/${slug}`);
    expect(postPath("poll", SAMPLE_UUID, { comments: true })).toBe(
      `/poll/${slug}#comments`,
    );
  });

  it("keeps mock corpus slugs in the URL", () => {
    expect(postPath("petition", "pet-wei-path")).toBe("/petition/pet-wei-path");
  });
});

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
    expect(officialPath("ab-premier")).toBe("/official/ab-premier");
    expect(officialPath("@oursay")).toBe("/official/oursay");
    expect(officialPath("")).toBeNull();
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
