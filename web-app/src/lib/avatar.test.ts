import { describe, expect, it } from "vitest";
import {
  avatarDataUri,
  DEFAULT_USER_ICON_TYPE,
  DEFAULT_VERIFIED_USER_ICON_TYPE,
  OFFICIAL_SEAT_ICON_TYPE,
  PERSONA_ICON_TYPE,
  UNVERIFIED_PERSONA_ICON_TYPE,
  UNVERIFIED_USER_ICON_TYPE,
  USER_ICON_TYPES,
  effectivePersonaIconType,
  effectiveUserIconType,
  parseStoredUserIconType,
} from "./avatar";

describe("avatarDataUri (DiceBear multi-style)", () => {
  it("is deterministic for the same seed + style", () => {
    const a = avatarDataUri("alex_morgan", "thumbs");
    expect(a.startsWith("data:image/svg+xml")).toBe(true);
    expect(avatarDataUri("alex_morgan", "thumbs")).toBe(a);
  });

  it("defaults unset style to bottts-neutral hard-wire", () => {
    expect(DEFAULT_USER_ICON_TYPE).toBe("bottts-neutral");
    expect(UNVERIFIED_USER_ICON_TYPE).toBe("bottts-neutral");
    expect(avatarDataUri("alex_morgan")).toBe(avatarDataUri("alex_morgan", "bottts-neutral"));
  });

  it("different seeds produce different avatars", () => {
    expect(avatarDataUri("alex_morgan", "thumbs")).not.toBe(
      avatarDataUri("BraveOtter42", "thumbs"),
    );
  });

  it("different styles produce different URIs for the same seed", () => {
    const a = avatarDataUri("alex_morgan", "rings");
    const b = avatarDataUri("alex_morgan", "stripes");
    expect(a).not.toBe(b);
  });

  it("hard-wires persona and official seat style constants", () => {
    expect(PERSONA_ICON_TYPE).toBe("initial-face");
    expect(UNVERIFIED_PERSONA_ICON_TYPE).toBe("bottts");
    expect(OFFICIAL_SEAT_ICON_TYPE).toBe("disco");
    expect(avatarDataUri("persona", PERSONA_ICON_TYPE).startsWith("data:")).toBe(true);
    expect(avatarDataUri("persona", UNVERIFIED_PERSONA_ICON_TYPE).startsWith("data:")).toBe(
      true,
    );
    expect(avatarDataUri("seat", OFFICIAL_SEAT_ICON_TYPE).startsWith("data:")).toBe(true);
  });

  it("plain bottts differs from bottts-neutral for the same seed", () => {
    expect(avatarDataUri("BraveOtter42", "bottts")).not.toBe(
      avatarDataUri("BraveOtter42", "bottts-neutral"),
    );
  });

  it("effectivePersonaIconType: unverified → bottts, verified → initial-face", () => {
    expect(effectivePersonaIconType(false)).toBe("bottts");
    expect(effectivePersonaIconType(true)).toBe("initial-face");
  });

  it("does not store bottts; unverified hard-wires, verified defaults to thumbs", () => {
    expect(parseStoredUserIconType("bottts-neutral")).toBeNull();
    expect(parseStoredUserIconType(undefined)).toBeNull();
    expect(parseStoredUserIconType("rings")).toBe("rings");
    expect(effectiveUserIconType(null, false)).toBe("bottts-neutral");
    expect(effectiveUserIconType("rings", false)).toBe("bottts-neutral");
    expect(effectiveUserIconType(null, true)).toBe("thumbs");
    expect(effectiveUserIconType("bottts-neutral", true)).toBe("thumbs");
    expect(effectiveUserIconType("rings", true)).toBe("rings");
    expect(DEFAULT_VERIFIED_USER_ICON_TYPE).toBe("thumbs");
    expect(USER_ICON_TYPES).toHaveLength(6);
    expect(USER_ICON_TYPES).not.toContain("bottts-neutral");
    expect(USER_ICON_TYPES).not.toContain("bottts");
  });
});
