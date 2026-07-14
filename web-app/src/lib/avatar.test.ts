import { describe, expect, it } from "vitest";
import {
  avatarDataUri,
  DEFAULT_USER_ICON_TYPE,
  OFFICIAL_SEAT_ICON_TYPE,
  PERSONA_ICON_TYPE,
  USER_ICON_TYPES,
} from "./avatar";

describe("avatarDataUri (DiceBear multi-style)", () => {
  it("is deterministic for the same seed + style", () => {
    const a = avatarDataUri("alex_morgan", "thumbs");
    expect(a.startsWith("data:image/svg+xml")).toBe(true);
    expect(avatarDataUri("alex_morgan", "thumbs")).toBe(a);
  });

  it("defaults unset style to thumbs", () => {
    expect(DEFAULT_USER_ICON_TYPE).toBe("thumbs");
    expect(avatarDataUri("alex_morgan")).toBe(avatarDataUri("alex_morgan", "thumbs"));
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
    expect(OFFICIAL_SEAT_ICON_TYPE).toBe("disco");
    expect(avatarDataUri("persona", PERSONA_ICON_TYPE).startsWith("data:")).toBe(true);
    expect(avatarDataUri("seat", OFFICIAL_SEAT_ICON_TYPE).startsWith("data:")).toBe(true);
  });

  it("user allowlist has six choosable styles with thumbs first", () => {
    expect(USER_ICON_TYPES).toHaveLength(6);
    expect(USER_ICON_TYPES[0]).toBe("thumbs");
    expect(USER_ICON_TYPES).not.toContain("glass");
    expect(USER_ICON_TYPES).not.toContain("initial-face");
    expect(USER_ICON_TYPES).not.toContain("disco");
  });
});
